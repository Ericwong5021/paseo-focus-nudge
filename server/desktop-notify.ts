import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export async function notifyDesktop(input: {
  title: string;
  message: string;
  sound: boolean;
}): Promise<{ delivered: boolean; detail: string }> {
  const { title, message, sound } = input;
  if (process.platform === "darwin") {
    const script = `display notification ${appleScriptString(message)} with title ${appleScriptString(title)}${sound ? ' sound name "Glass"' : ""}`;
    const args = ["-e", script];
    try {
      await execFileAsync("osascript", args);
      return { delivered: true, detail: "已在这台电脑上弹出通知" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "osascript failed";
      return { delivered: false, detail };
    }
  }

  if (process.platform === "linux") {
    const args = ["-a", "Paseo", title, message];
    if (sound) args.push("-h", "string:sound-name:message-new-instant");
    try {
      await execFileAsync("notify-send", args);
      return { delivered: true, detail: "已在这台电脑上弹出通知" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "notify-send failed";
      return { delivered: false, detail };
    }
  }

  return { delivered: false, detail: "这台电脑的系统不支持弹窗" };
}
