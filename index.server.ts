import type { PluginServerContext, PluginHandlerContext } from "@getpaseo/plugin/server";
import { basename } from "node:path";
import { notifyDesktop } from "./server/desktop-notify";
import { pushToPhone, getPushStatus, disposePushChecks } from "./server/phone-push";
import {
  disconnectRpc,
  syncRpc,
  testRpc,
  pushStatusRpc,
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
  const testTimers = new Set<ReturnType<typeof setTimeout>>();
  let hostId: string | null = null;
  async function resolveHostId(paseo: PluginHandlerContext["paseo"]) {
    return hostId ?? (hostId = (await paseo.hosts.list()).self.serverId);
  }

  async function deliver(
    target: NudgeTarget,
    values: Preferences,
    message: string,
    eventId: string,
    agentId: string | null,
    workspaceId: string | null,
    serverId: string,
    title = TITLE,
  ) {
    if (target === "desktop") {
      return notifyDesktop({ title, message, sound: values.desktop.sound });
    }
    return pushToPhone({
      title,
      message,
      strong: values.phone.strong,
      eventId,
      agentId,
      workspaceId,
      serverId,
    });
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

  const removeTurnHook = server.addHook(
    "agent.turn.after",
    async ({ agent, turnId, outcome }, { paseo }) => {
      const eventId = `${agent.id}:${turnId ?? `local-${++unidentifiedTurn}`}`;
      if (completedTurns.has(eventId)) return;
      completedTurns.add(eventId);
      if (completedTurns.size > 1000) completedTurns.delete(completedTurns.values().next().value!);
      const state = await settings.read();
      if (state.status !== "ready") return;
      const normalized: TurnFinishedEvent["outcome"] =
        outcome.kind === "failed"
          ? { kind: "failed", error: outcome.error.message.slice(0, 400) }
          : outcome.kind === "canceled"
            ? { kind: "canceled", reason: outcome.reason.slice(0, 400) }
            : { kind: "completed" };
      const status =
        normalized.kind === "failed"
          ? `本轮对话失败：${normalized.error}`
          : normalized.kind === "canceled"
            ? `本轮对话已取消：${normalized.reason}`
            : "本轮对话已完成。";
      const messageFor = (message: string) => {
        const custom = message.trim().slice(0, 400);
        return (
          !custom || custom === DEFAULT_MESSAGE ? `${status}点击查看结果。` : `${status}\n${custom}`
        ).slice(0, 800);
      };
      // Hook titles may precede an automatic title update. Refresh once for all
      // recipients and use the same project display names as Paseo's own UI.
      const snapshot = await paseo.agents
        .ref(agent.id)
        .refresh()
        .catch(() => null);
      const agentTitle =
        snapshot?.agent.title?.trim() ||
        agent.title?.trim() ||
        `未命名对话 (${agent.id.slice(0, 8)})`;
      const projectTitle =
        snapshot?.project?.projectName?.trim() || `目录：${basename(agent.cwd) || agent.cwd}`;
      const workspaceTitle = snapshot?.project?.workspaceName?.trim() || null;
      const notificationTitle = `${projectTitle} · ${agentTitle}`;
      const eventSequence = ++sequence;
      const backgroundTargets = new Set<NudgeTarget>();
      for (const [id, device] of devices) {
        const lease = device.background ? BACKGROUND_LEASE : FOREGROUND_LEASE;
        if (Date.now() - device.updatedAt > lease) {
          devices.delete(id);
          continue;
        }
        const profile = state.values[device.target];
        if (!profile.enabled) continue;
        // Keep OS delivery active when an app cannot be seen. Desktop also queues
        // its clickable in-app bubble for clients that are still rendering.
        if (device.background) backgroundTargets.add(device.target);
        if (!device.background || device.target === "desktop") {
          device.events.push({
            dismissSeconds: profile.dismissSeconds,
            sequence: eventSequence,
            eventId,
            agentId: agent.id,
            agentTitle,
            projectTitle,
            workspaceTitle,
            workspaceId: agent.workspaceId,
            turnId,
            message: messageFor(profile.message),
            outcome: normalized,
          });
          device.events = device.events.slice(-50);
        }
      }
      await Promise.allSettled(
        [...backgroundTargets].map(async (target) => {
          const message = messageFor(state.values[target].message);
          const result = await deliver(
            target,
            state.values,
            message,
            eventId,
            agent.id,
            agent.workspaceId,
            await resolveHostId(paseo),
            notificationTitle,
          );
          if (!result.delivered) console.warn(`[focus-nudge] ${target}: ${result.detail}`);
        }),
      );
    },
  );

  server.handle(pushStatusRpc, () => getPushStatus());
  server.handle(testRpc, async ({ target, delaySeconds = 5 }, { paseo }) => {
    const state = await settings.read();
    if (state.status !== "ready") return { delivered: false, detail: "设置还不可用" };
    if (!state.values[target].enabled) return { delivered: false, detail: "这组提醒是关的" };
    const serverId = await resolveHostId(paseo);
    const send = () =>
      deliver(
        target,
        state.values,
        state.values[target].message || DEFAULT_MESSAGE,
        `test-${Date.now()}`,
        null,
        null,
        serverId,
      );
    if (delaySeconds === 0) return send();
    const timer = setTimeout(() => {
      testTimers.delete(timer);
      void send()
        .then((result) => {
          if (!result.delivered) console.warn(`[focus-nudge] Test push: ${result.detail}`);
        })
        .catch((error) => console.warn("[focus-nudge] Test push failed", error));
    }, delaySeconds * 1000);
    testTimers.add(timer);
    return {
      scheduled: true,
      delivered: false,
      detail: `${delaySeconds} 秒后发送，请现在切换到其他 App`,
    };
  });

  return () => {
    removeTurnHook();
    for (const timer of testTimers) clearTimeout(timer);
    disposePushChecks();
    devices.clear();
    completedTurns.clear();
  };
}
