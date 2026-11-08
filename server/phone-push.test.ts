import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disposePushChecks, getPushStatus, pushToPhone } from "./phone-push";

const originalHome = process.env.PASEO_HOME;
const fixtures: string[] = [];
const input = {
  title: "Paseo 对话已结束",
  message: "回来查看结果。",
  strong: false,
  eventId: "agent:turn",
  serverId: "host-1",
};

async function registerPhone() {
  const home = await mkdtemp(join(tmpdir(), "focus-nudge-"));
  fixtures.push(home);
  process.env.PASEO_HOME = home;
  await writeFile(
    join(home, "push-tokens.json"),
    JSON.stringify({
      subscriptions: [
        {
          token: "ExponentPushToken[test]",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    }),
  );
}

afterEach(async () => {
  disposePushChecks();
  vi.useRealTimers();
  if (originalHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = originalHome;
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("phone completion payload", () => {
  it("marks completion pushes for a banner channel", async () => {
    await registerPhone();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 }),
      );

    await expect(
      pushToPhone({
        title: "Paseo 对话已结束",
        message: "回来查看结果。",
        strong: true,
        eventId: "agent:turn",
        serverId: "host-1",
        agentId: "agent-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toMatchObject({ delivered: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body[0]).toMatchObject({
      channelId: "default",
      priority: "high",
      interruptionLevel: "time-sensitive",
      data: {
        source: "focus-nudge",
        kind: "turn-finished",
        eventId: "agent:turn",
        serverId: "host-1",
        agentId: "agent-1",
        workspaceId: "workspace-1",
      },
    });
  });
  it("distinguishes Expo acceptance from provider acceptance without claiming device display", async () => {
    await registerPhone();
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ status: "ok", id: "receipt-1" }] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { "receipt-1": { status: "ok" } } })),
      );
    await pushToPhone(input);
    expect(getPushStatus().stage).toBe("accepted");
    await vi.advanceTimersByTimeAsync(2000);
    expect(getPushStatus().stage).toBe("provider-accepted");
    expect(getPushStatus().detail).toContain("尚未确认手机显示");
  });
  it("surfaces a provider rejection and redacts any token in its error", async () => {
    await registerPhone();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ status: "ok", id: "receipt-1" }] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              "receipt-1": {
                status: "error",
                message: "DeviceNotRegistered ExponentPushToken[secret]",
              },
            },
          }),
        ),
      );
    await pushToPhone(input);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getPushStatus()).toMatchObject({ stage: "error" });
    expect(getPushStatus().detail).toContain("DeviceNotRegistered ExpoPushToken[…]");
  });
  it("reports network failure as unconfirmed without resending", async () => {
    await registerPhone();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));
    expect(await pushToPhone(input)).toMatchObject({ delivered: false });
    expect(getPushStatus()).toMatchObject({
      stage: "error",
      detail: "连接 Expo 失败：Network failure",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not query old receipts after disposal", async () => {
    await registerPhone();
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ status: "ok", id: "receipt-1" }] })),
      );
    await pushToPhone(input);
    disposePushChecks();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
