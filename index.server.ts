import type { PluginServerContext } from "@getpaseo/plugin/server";
import { notifyDesktop } from "./server/desktop-notify";
import { pushToPhone } from "./server/phone-push";
import {
  disconnectRpc,
  syncRpc,
  testRpc,
  type NudgeTarget,
  type TurnFinishedEvent,
} from "./shared/nudge";
import { DEFAULT_MESSAGE, preferences, type Preferences } from "./shared/settings";

const TITLE = "Paseo 对话已结束";
const FOREGROUND_LEASE = 60_000;
const BACKGROUND_LEASE = 24 * 60 * 60_000;

type Device = {
  target: NudgeTarget;
  background: boolean;
  updatedAt: number;
  events: TurnFinishedEvent[];
};

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  const devices = new Map<string, Device>();
  const completedTurns = new Set<string>();
  let sequence = 0;
  let unidentifiedTurn = 0;

  async function deliver(
    target: NudgeTarget,
    values: Preferences,
    message: string,
    eventId: string,
  ) {
    if (target === "desktop") {
      return notifyDesktop({ title: TITLE, message, sound: values.desktop.sound });
    }
    return pushToPhone({ title: TITLE, message, strong: values.phone.strong, eventId });
  }

  server.handle(syncRpc, ({ clientId, target, background, after }) => {
    const previous = devices.get(clientId);
    const events = (previous?.events ?? []).filter(
      (event) => after !== null && event.sequence > after,
    );
    devices.set(clientId, { target, background, updatedAt: Date.now(), events });
    return { events, cursor: sequence };
  });
  server.handle(disconnectRpc, ({ clientId }) => {
    devices.delete(clientId);
    return {};
  });

  const removeTurnHook = server.addHook("agent.turn.after", async ({ agent, turnId, outcome }) => {
    const eventId = `${agent.id}:${turnId ?? `local-${++unidentifiedTurn}`}`;
    if (completedTurns.has(eventId)) return;
    completedTurns.add(eventId);
    if (completedTurns.size > 1000) completedTurns.delete(completedTurns.values().next().value!);
    const state = await settings.read();
    if (state.status !== "ready") return;
    const eventSequence = ++sequence;
    const normalized: TurnFinishedEvent["outcome"] =
      outcome.kind === "failed"
        ? { kind: "failed", error: outcome.error.message.slice(0, 400) }
        : outcome.kind === "canceled"
          ? { kind: "canceled", reason: outcome.reason.slice(0, 400) }
          : { kind: "completed" };
    const suffix =
      normalized.kind === "failed"
        ? `\n对话失败：${normalized.error}`
        : normalized.kind === "canceled"
          ? `\n对话已取消：${normalized.reason}`
          : "";
    const backgroundTargets = new Set<NudgeTarget>();
    for (const [id, device] of devices) {
      const lease = device.background ? BACKGROUND_LEASE : FOREGROUND_LEASE;
      if (Date.now() - device.updatedAt > lease) {
        devices.delete(id);
        continue;
      }
      const profile = state.values[device.target];
      if (!profile.enabled) continue;
      if (device.background) {
        backgroundTargets.add(device.target);
      } else {
        device.events.push({
          sequence: eventSequence,
          eventId,
          agentId: agent.id,
          agentTitle: agent.title,
          turnId,
          message: `${profile.message.trim().slice(0, 400) || DEFAULT_MESSAGE}${suffix}`,
          outcome: normalized,
        });
        device.events = device.events.slice(-50);
      }
    }
    await Promise.allSettled(
      [...backgroundTargets].map(async (target) => {
        const message = `${state.values[target].message.trim().slice(0, 400) || DEFAULT_MESSAGE}${suffix}`;
        const result = await deliver(target, state.values, message, eventId);
        if (!result.delivered) console.warn(`[focus-nudge] ${target}: ${result.detail}`);
      }),
    );
  });

  server.handle(testRpc, async ({ target }) => {
    const state = await settings.read();
    if (state.status !== "ready") return { delivered: false, detail: "设置还不可用" };
    if (!state.values[target].enabled) return { delivered: false, detail: "这组提醒是关的" };
    return deliver(
      target,
      state.values,
      state.values[target].message || DEFAULT_MESSAGE,
      `test-${Date.now()}`,
    );
  });

  return () => {
    removeTurnHook();
    devices.clear();
    completedTurns.clear();
  };
}
