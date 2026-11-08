import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPLETION_CHANNEL_ID, pushToPhone } from "./phone-push";

const originalHome = process.env.PASEO_HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = originalHome;
  vi.restoreAllMocks();
});

describe("phone completion payload", () => {
  it("marks completion pushes for a banner channel", async () => {
    const home = await mkdtemp(join(tmpdir(), "focus-nudge-"));
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
      }),
    ).resolves.toMatchObject({ delivered: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body[0]).toMatchObject({
      channelId: COMPLETION_CHANNEL_ID,
      priority: "high",
      interruptionLevel: "time-sensitive",
      data: { source: "focus-nudge", kind: "turn-finished", eventId: "agent:turn" },
    });
    await rm(home, { recursive: true, force: true });
  });
});
