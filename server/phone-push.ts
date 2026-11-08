import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const COMPLETION_CHANNEL_ID = "paseo-turn-finished";

function tokenFile(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "push-tokens.json");
}

function sanitize(value: string): string {
  return value.replace(/ExponentPushToken\[[^\]]+\]/g, "ExponentPushToken[…]");
}

/** Active Expo tokens Paseo stored for this daemon. The file is private to Paseo. */
export async function readActivePushTokens(now = Date.now()): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(tokenFile(), "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const subscriptions = (parsed as { subscriptions?: unknown }).subscriptions;
  if (!Array.isArray(subscriptions)) return [];

  const tokens: string[] = [];
  for (const entry of subscriptions) {
    if (!entry || typeof entry !== "object") continue;
    const token = (entry as { token?: unknown }).token;
    const expiresAt = (entry as { expiresAt?: unknown }).expiresAt;
    if (typeof token !== "string" || typeof expiresAt !== "string") continue;
    const expiry = Date.parse(expiresAt);
    if (!token.startsWith("ExponentPushToken[") || !Number.isFinite(expiry) || expiry <= now)
      continue;
    tokens.push(token);
  }
  return tokens;
}

export async function pushToPhone(input: {
  title: string;
  message: string;
  strong: boolean;
  eventId: string;
}): Promise<{ delivered: boolean; detail: string }> {
  const tokens = await readActivePushTokens();
  if (tokens.length === 0) {
    return {
      delivered: false,
      detail:
        "这台电脑上还没有手机通知登记。请在手机上打开 Paseo，允许通知，并确认它连的是这台电脑。",
    };
  }

  const messages = tokens.map((token) => ({
    to: token,
    title: input.title,
    body: input.message,
    data: {
      source: "focus-nudge",
      kind: "turn-finished",
      eventId: input.eventId,
    },
    channelId: COMPLETION_CHANNEL_ID,
    sound: "default",
    priority: "high",
    ...(input.strong ? { interruptionLevel: "time-sensitive" } : {}),
  }));

  try {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10_000);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
      signal: abort.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      return { delivered: false, detail: `手机推送没有发出，服务返回 ${response.status}` };
    }
    const payload = (await response.json()) as {
      data?: Array<{ status?: string; message?: string }>;
    };
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    const accepted = tickets.filter((ticket) => ticket.status === "ok").length;
    if (accepted > 0) {
      return {
        delivered: true,
        detail: accepted === 1 ? "已推送到手机" : `已推送到 ${accepted} 台手机`,
      };
    }
    const reason = tickets.find((ticket) => ticket.message)?.message;
    return { delivered: false, detail: sanitize(reason || "手机没有接受这条推送") };
  } catch {
    return { delivered: false, detail: "连不上手机推送服务" };
  }
}
