import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
// This channel already exists in released Paseo apps. Unknown channels drop notifications.
export const COMPLETION_CHANNEL_ID = "default";

type PushStatus = {
  stage: "idle" | "sending" | "accepted" | "provider-accepted" | "error";
  detail: string;
  checkedAt: number;
};
let status: PushStatus = { stage: "idle", detail: "尚未发送手机推送", checkedAt: 0 };
let generation = 0;
const checks = new Set<ReturnType<typeof setTimeout>>();
export function getPushStatus(): PushStatus {
  return { ...status };
}
export function disposePushChecks(): void {
  generation++;
  for (const timer of checks) clearTimeout(timer);
  checks.clear();
}
function update(stage: PushStatus["stage"], detail: string) {
  status = { stage, detail: sanitize(detail), checkedAt: Date.now() };
}
function tokenFile(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "push-tokens.json");
}
function sanitize(value: string): string {
  return value.replace(/Expo(?:nent)?PushToken\[[^\]]+\]/g, "ExpoPushToken[…]");
}
function networkError(error: unknown): string {
  const failure = error as { name?: string; message?: string; cause?: { code?: string } };
  if (failure?.name === "TimeoutError" || failure?.name === "AbortError")
    return "连接 Expo 超时，推送接收状态未确认";
  return sanitize(`连接 Expo 失败：${failure?.cause?.code || failure?.message || "未知网络错误"}`);
}
async function post(url: string, body: unknown) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: abort.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);
  return response.json();
}

export async function readActivePushTokens(now = Date.now()): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(tokenFile(), "utf8"));
    const subscriptions = (parsed as { subscriptions?: unknown } | null)?.subscriptions;
    if (!Array.isArray(subscriptions)) return [];
    const tokens = subscriptions.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const { token, expiresAt } = entry as { token?: unknown; expiresAt?: unknown };
      if (typeof token !== "string" || typeof expiresAt !== "string") return [];
      return /^Expo(?:nent)?PushToken\[.+\]$/.test(token) && Date.parse(expiresAt) > now
        ? [token]
        : [];
    });
    return [...new Set(tokens)];
  } catch {
    return [];
  }
}

function checkReceipts(ids: string[], attempt: number, token: number): void {
  const delays = [2000, 10_000, 30_000];
  const timer = setTimeout(async () => {
    checks.delete(timer);
    try {
      const result = (await post(EXPO_RECEIPTS_URL, { ids })) as {
        data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>;
      };
      if (token !== generation) return;
      const receipts = Object.values(result.data ?? {});
      const failed = receipts.find((receipt) => receipt.status === "error");
      if (failed) {
        update("error", `手机推送被拒绝：${failed.details?.error || failed.message || "未知原因"}`);
        console.warn(`[focus-nudge] ${status.detail}`);
      } else if (
        receipts.length === ids.length &&
        receipts.every((receipt) => receipt.status === "ok")
      ) {
        update(
          "provider-accepted",
          "FCM/APNs 已接收，尚未确认手机显示。未收到时请检查设备登记、网络和系统通知设置。",
        );
      } else if (attempt + 1 < delays.length) checkReceipts(ids, attempt + 1, token);
    } catch (error) {
      if (token === generation)
        update("accepted", `Expo 已接收，回执查询失败：${networkError(error)}`);
    }
  }, delays[attempt]);
  timer.unref?.();
  checks.add(timer);
}

export async function pushToPhone(input: {
  title: string;
  message: string;
  strong: boolean;
  eventId: string;
  serverId: string;
  agentId?: string | null;
  workspaceId?: string | null;
}): Promise<{ delivered: boolean; detail: string }> {
  disposePushChecks();
  const token = generation;
  update("sending", "正在发送手机推送…");
  const tokens = await readActivePushTokens();
  if (!tokens.length) {
    update("error", "还没有有效的手机通知登记。请在手机打开 Paseo，允许通知并连接这台电脑。");
    return { delivered: false, detail: status.detail };
  }
  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.message,
    data: {
      source: "focus-nudge",
      kind: "turn-finished",
      eventId: input.eventId,
      serverId: input.serverId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    channelId: COMPLETION_CHANNEL_ID,
    sound: "default",
    priority: "high",
    ...(input.strong ? { interruptionLevel: "time-sensitive" } : {}),
  }));
  try {
    const result = (await post(EXPO_PUSH_URL, messages)) as {
      data?: Array<{
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }>;
    };
    const tickets = Array.isArray(result.data) ? result.data : [];
    const accepted = tickets.filter((ticket) => ticket.status === "ok");
    if (accepted.length) {
      update("accepted", `Expo 已接收 ${accepted.length} 条推送，等待手机服务回执`);
      const ids = accepted.flatMap((ticket) => (ticket.id ? [ticket.id] : []));
      if (ids.length) checkReceipts(ids, 0, token);
      return { delivered: true, detail: status.detail };
    }
    const failed = tickets.find((ticket) => ticket.message || ticket.details?.error);
    update(
      "error",
      `Expo 拒绝推送：${failed?.details?.error || failed?.message || "没有有效推送票据"}`,
    );
  } catch (error) {
    update("error", networkError(error));
  }
  return { delivered: false, detail: status.detail };
}
