import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  Platform: { OS: "ios" },
  AppState: { currentState: "active", addEventListener: vi.fn() },
  Alert: { alert: vi.fn() },
}));
vi.mock("react-native", () => native);
vi.mock("../client/web", () => ({
  isDocumentHidden: () => false,
  subscribeDocumentVisibility: () => () => {},
  showDocumentToast: vi.fn(),
}));
import { startCompletionWatch } from "../client/watch";
import { syncRpc } from "../shared/nudge";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  native.AppState.currentState = "active";
});
describe("mobile completion watch", () => {
  it("shows an in-app alert on a released host and never sends a notification for AppState changes", async () => {
    vi.useFakeTimers();
    let changed!: () => void;
    native.AppState.addEventListener.mockImplementation((_name, fn) => {
      changed = fn;
      return { remove() {} };
    });
    const event = {
      sequence: 1,
      eventId: "a:t",
      agentTitle: "Demo",
      message: "Finished",
      outcome: { kind: "completed" },
    };
    const rpc = vi.fn(async (_contract, input) => ({
      events: input.after === 0 ? [event] : [],
      cursor: input.after === null ? 0 : 1,
    }));
    const stop = startCompletionWatch({ rpc } as never);
    await vi.advanceTimersByTimeAsync(1500);
    expect(native.Alert.alert).toHaveBeenCalledWith("Paseo · Demo", "Finished");
    native.AppState.currentState = "background";
    changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenLastCalledWith(syncRpc, expect.objectContaining({ background: true }));
    expect(native.Alert.alert).toHaveBeenCalledTimes(1);
    stop();
  });
});
