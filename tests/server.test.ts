import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginServerContext, PluginHookEvents } from "@getpaseo/plugin/server";
import contribute from "../index.server";
import { syncRpc } from "../shared/nudge";
import { DEFAULT_MESSAGE, preferences } from "../shared/settings";

const delivery = vi.hoisted(() => ({
  desktop: vi.fn(async () => ({ delivered: true, detail: "ok" })),
  phone: vi.fn(async (_input: unknown) => ({ delivered: true, detail: "ok" })),
}));
vi.mock("../server/desktop-notify", () => ({ notifyDesktop: delivery.desktop }));
vi.mock("../server/phone-push", () => ({
  pushToPhone: delivery.phone,
  getPushStatus: () => ({ stage: "idle", detail: "", checkedAt: 0 }),
  disposePushChecks() {},
}));

function harness() {
  const handlers = new Map<string, (input: any) => any>();
  let turnAfter!: (input: PluginHookEvents["agent.turn.after"], context: any) => Promise<void>;
  const values = preferences.schema.parse({});
  const server = {
    registerSettings: () => ({ read: async () => ({ status: "ready", revision: "test", values }) }),
    handle: (contract: { name: string }, handler: (input: any) => any) =>
      handlers.set(contract.name, handler),
    addHook: (_name: string, handler: typeof turnAfter) => {
      turnAfter = handler;
      return () => {};
    },
  } as unknown as PluginServerContext;
  const cleanup = contribute(server);
  const sync = (
    clientId: string,
    target: "phone" | "desktop",
    background: boolean,
    after: number | null = null,
  ) => handlers.get(syncRpc.name)!({ clientId, target, background, after });
  const finish = (
    outcome: PluginHookEvents["agent.turn.after"]["outcome"],
    turnId: string | null = "turn-1",
  ) =>
    turnAfter(
      {
        agent: {
          id: "agent-1",
          title: "Demo",
          workspaceId: null,
          parentAgentId: null,
          provider: "test",
          cwd: "/tmp",
        },
        turnId,
        outcome,
        timeline: [],
      },
      { paseo: { hosts: { list: async () => ({ self: { serverId: "host-1" } }) } } },
    );
  return { sync, finish, cleanup, values };
}
beforeEach(() => vi.clearAllMocks());

describe("completion routing through the released RPC API", () => {
  it("only records presence when focus changes", () => {
    const h = harness();
    h.sync("phone", "phone", false);
    h.sync("phone", "phone", true, 0);
    h.sync("phone", "phone", false, 0);
    expect(delivery.phone).not.toHaveBeenCalled();
    expect(delivery.desktop).not.toHaveBeenCalled();
    h.cleanup();
  });
  it.each([
    { kind: "completed" as const },
    { kind: "failed" as const, error: { message: "failed" } },
    { kind: "canceled" as const, reason: "stopped" },
  ])("queues $kind for a foreground device without a system push", async (outcome) => {
    const h = harness();
    h.sync("phone", "phone", false);
    await h.finish(outcome);
    const result = h.sync("phone", "phone", false, 0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].outcome.kind).toBe(outcome.kind);
    expect(delivery.phone).not.toHaveBeenCalled();
    expect(h.sync("phone", "phone", false, result.cursor).events).toEqual([]);
    h.cleanup();
  });
  it("pushes once for background phones and queues a tappable reminder for desktop", async () => {
    const h = harness();
    h.sync("a", "phone", true);
    h.sync("b", "phone", true);
    h.sync("c", "desktop", true);
    await Promise.all([h.finish({ kind: "completed" }), h.finish({ kind: "completed" })]);
    expect(delivery.phone).toHaveBeenCalledTimes(1);
    expect(delivery.desktop).toHaveBeenCalledTimes(1);
    expect(delivery.phone.mock.calls[0]?.[0]).toMatchObject({
      eventId: "agent-1:turn-1",
      agentId: "agent-1",
      serverId: "host-1",
    });
    const desktop = h.sync("c", "desktop", true, 0);
    expect(desktop.events).toHaveLength(1);
    expect(desktop.events[0]).toMatchObject({ agentId: "agent-1", workspaceId: null });
    h.cleanup();
  });
  it("keeps background delivery armed while the phone is suspended", async () => {
    const h = harness();
    h.sync("a", "phone", true);
    vi.useFakeTimers();
    vi.advanceTimersByTime(120_000);
    await h.finish({ kind: "completed" });
    expect(delivery.phone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    h.cleanup();
  });
  it("keeps long failure reminders within the RPC message limit", async () => {
    const h = harness();
    h.values.phone.message = "提".repeat(400);
    h.sync("phone", "phone", false);
    await h.finish({ kind: "failed", error: { message: "错".repeat(400) } });
    expect(() => syncRpc.output.parse(h.sync("phone", "phone", false, 0))).not.toThrow();
    h.cleanup();
  });
  it("obeys disabled settings and resets focus settings during migration", async () => {
    const h = harness();
    h.values.phone.enabled = false;
    h.sync("phone", "phone", true);
    await h.finish({ kind: "completed" });
    expect(delivery.phone).not.toHaveBeenCalled();
    expect(await preferences.migrate?.({ phone: { message: "old" } }, 3)).toMatchObject({
      phone: { message: "old", dismissSeconds: 5 },
      desktop: { dismissSeconds: 5 },
    });
    h.cleanup();
  });
});
