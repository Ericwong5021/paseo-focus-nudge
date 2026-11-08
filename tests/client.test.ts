import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  Platform: { OS: "ios" },
  AppState: { currentState: "active", addEventListener: vi.fn() },
  Alert: { alert: vi.fn() },
}));
vi.mock("react-native", () => native);
const web = vi.hoisted(() => ({ hidden: false, show: vi.fn() }));
const bubble = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("../client/web", () => ({
  isDocumentHidden: () => web.hidden,
  subscribeDocumentVisibility: () => () => {},
  showDocumentToast: web.show,
}));
vi.mock("../client/bubble", () => ({ showNativeBubble: bubble.show }));
import { startCompletionWatch } from "../client/watch";
import { syncRpc } from "../shared/nudge";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  native.AppState.currentState = "active";
  native.Platform.OS = "ios";
  web.hidden = false;
});
const event = {
  sequence: 1,
  eventId: "a:t",
  agentId: "agent-1",
  agentTitle: "Demo",
  projectTitle: "我的项目",
  workspaceTitle: "主工作区",
  workspaceId: "workspace-1",
  turnId: "turn-1",
  message: "Finished",
  dismissSeconds: 3,
  outcome: { kind: "completed" },
};
function client() {
  const openScreen = vi.fn();
  const rpc = vi.fn(async (contract: { name: string }, input: { after?: number | null }) => {
    if (contract.name !== syncRpc.name) return {};
    return { events: input.after === 0 ? [event] : [], cursor: input.after === null ? 0 : 1 };
  });
  return { rpc, openScreen };
}

describe("completion bubble", () => {
  it("shows a timed native bubble that opens its conversation through a registered screen", async () => {
    vi.useFakeTimers();
    native.AppState.addEventListener.mockImplementation(() => ({ remove() {} }));
    const h = client();
    const stop = startCompletionWatch(h as never);
    await vi.advanceTimersByTimeAsync(1500);
    expect(bubble.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Demo",
        context: "我的项目 · 主工作区",
        message: "Finished",
        durationMs: 3000,
      }),
    );
    bubble.show.mock.calls[0]?.[0].onPress();
    expect(h.openScreen).toHaveBeenCalledWith({
      screenId: "open-conversation",
      params: { agentId: "agent-1" },
    });
    expect(native.Alert.alert).not.toHaveBeenCalled();
    stop();
  });
  it("never shows a foreground bubble after the phone enters background", async () => {
    vi.useFakeTimers();
    let changed!: () => void;
    native.AppState.addEventListener.mockImplementation((_name, fn) => {
      changed = fn;
      return { remove() {} };
    });
    const h = client();
    const stop = startCompletionWatch(h as never);
    await vi.advanceTimersByTimeAsync(0);
    native.AppState.currentState = "background";
    changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.rpc).toHaveBeenLastCalledWith(syncRpc, expect.objectContaining({ background: true }));
    expect(bubble.show).not.toHaveBeenCalled();
    stop();
  });
  it("continues polling an unfocused desktop and uses its lower-right corner", async () => {
    vi.useFakeTimers();
    native.Platform.OS = "web";
    web.hidden = true;
    native.AppState.addEventListener.mockImplementation(() => ({ remove() {} }));
    const h = client();
    const stop = startCompletionWatch(h as never);
    await vi.advanceTimersByTimeAsync(1500);
    expect(web.show).toHaveBeenCalledWith(
      "Demo",
      expect.objectContaining({
        context: "我的项目 · 主工作区",
        durationMs: 3000,
        placement: "bottom-end",
      }),
    );
    web.show.mock.calls[0]?.[1].onPress();
    expect(h.openScreen).toHaveBeenCalledWith({
      screenId: "open-conversation",
      params: { agentId: "agent-1" },
    });
    stop();
  });
});
