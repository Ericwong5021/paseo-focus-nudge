import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const nudgeTarget = z.enum(["desktop", "phone"]);
export const turnOutcome = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completed") }),
  z.object({ kind: z.literal("failed"), error: z.string().max(400) }),
  z.object({ kind: z.literal("canceled"), reason: z.string().max(400) }),
]);
export const turnFinishedEvent = z.object({
  sequence: z.number().int().nonnegative(),
  eventId: z.string(),
  agentId: z.string(),
  agentTitle: z.string().nullable(),
  turnId: z.string().nullable(),
  message: z.string().min(1).max(800),
  outcome: turnOutcome,
});

export const syncRpc = defineRpc({
  name: "focus-nudge.sync",
  input: z.object({
    clientId: z.string().min(1).max(100),
    target: nudgeTarget,
    background: z.boolean(),
    after: z.number().int().nonnegative().nullable(),
  }),
  output: z.object({ events: z.array(turnFinishedEvent), cursor: z.number().int().nonnegative() }),
});
export const disconnectRpc = defineRpc({
  name: "focus-nudge.disconnect",
  input: z.object({ clientId: z.string() }),
  output: z.object({}),
});
export const testRpc = defineRpc({
  name: "focus-nudge.test",
  input: z.object({ target: nudgeTarget }),
  output: z.object({ delivered: z.boolean(), detail: z.string() }),
});
export type NudgeTarget = z.infer<typeof nudgeTarget>;
export type TurnOutcome = z.infer<typeof turnOutcome>;
export type TurnFinishedEvent = z.infer<typeof turnFinishedEvent>;
