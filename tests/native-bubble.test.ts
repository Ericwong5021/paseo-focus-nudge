import { describe, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("@getpaseo/plugin/client/ui", () => ({
  useToast: () => ({ show: host.show }),
  Icon: "Icon",
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("react", async (original) => ({
  ...(await original<object>()),
  useEffect: (effect: () => void) => effect(),
}));
import { NativeBubbleBridge, showNativeBubble, OpenConversation } from "../client/bubble";

describe("native host toast adapter", () => {
  it("passes a tappable content node and configured lifetime to the actual toast surface API", () => {
    NativeBubbleBridge({
      theme: { colors: { foreground: "#fff", foregroundMuted: "#ccc" } },
    } as never);
    const onPress = vi.fn();
    showNativeBubble({
      title: "Demo",
      message: "Finished",
      durationMs: 5000,
      failed: false,
      onPress,
    });
    const [content, options] = host.show.mock.calls.at(-1)!;
    expect(content.props.children.props.accessibilityRole).toBe("button");
    expect(options).toEqual({ durationMs: 5000 });
    content.props.children.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
  });
  it("uses the surface navigation supplied by Paseo to open the target conversation", () => {
    const openAgent = vi.fn();
    OpenConversation({
      params: { agentId: "target" },
      navigation: { openAgent },
      theme: { colors: {} },
    } as never);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "target" });
  });
});
