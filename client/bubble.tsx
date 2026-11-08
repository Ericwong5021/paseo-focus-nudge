import { useEffect, useRef, type ReactNode } from "react";
import type { PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from "react-native";

export interface Bubble {
  title: string;
  message: string;
  durationMs: number;
  failed: boolean;
  onPress(): void;
}

type Presenter = (bubble: Bubble) => void;
let presenter: Presenter | null = null;
let pending: Bubble | null = null;

function BubbleEntrance({ children }: { children: ReactNode }) {
  const offset = useRef(new Animated.Value(-12)).current;
  useEffect(() => {
    let active = true;
    const animation = Animated.timing(offset, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (reduce) => {
        if (!active) return;
        if (reduce) offset.setValue(0);
        else animation.start();
      },
      () => {
        if (active) offset.setValue(0);
      },
    );
    return () => {
      active = false;
      animation.stop();
    };
  }, [offset]);
  return <Animated.View style={{ transform: [{ translateY: offset }] }}>{children}</Animated.View>;
}

export function showNativeBubble(bubble: Bubble): void {
  if (presenter) presenter(bubble);
  else pending = bubble;
}

export function NativeBubbleBridge({ theme }: PluginSidebarItemProps) {
  const toast = useToast();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show: Presenter = (bubble) => {
      const content = (
        <BubbleEntrance key={`${Date.now()}-${Math.random()}`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${bubble.title}，${bubble.message}，打开对话`}
            onPress={bubble.onPress}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              minHeight: 44,
              justifyContent: "center",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon
                name={bubble.failed ? "CircleAlert" : "MessageCircle"}
                size={20}
                color={theme.colors.foreground}
              />
              <View style={{ flexShrink: 1, gap: 3 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}
                >
                  {bubble.title}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }}
                >
                  {bubble.message}
                </Text>
              </View>
              <Icon name="ChevronRight" size={16} color={theme.colors.foregroundMuted} />
            </View>
          </Pressable>
        </BubbleEntrance>
      );
      // The 0.15.3 host forwards content to its ReactNode toast renderer unchanged.
      // Keep this adapter here: the published plugin types only describe string content.
      const showContent = toast.show as unknown as (
        content: ReactNode,
        options: { durationMs: number },
      ) => void;
      showContent(content, { durationMs: bubble.durationMs });
    };
    presenter = show;
    if (pending) {
      const bubble = pending;
      pending = null;
      show(bubble);
    }
    return () => {
      if (presenter === show) presenter = null;
    };
  }, [theme, toast]);
  return null;
}

export function OpenConversation({ params, navigation, theme }: PluginScreenProps) {
  useEffect(() => {
    if (params.agentId && navigation) navigation.openAgent({ agentId: params.agentId });
  }, [params.agentId, navigation]);
  return (
    <Text style={{ color: theme.colors.foregroundMuted }}>
      {navigation ? "正在打开对话…" : "当前 Paseo 版本不支持打开对话，请更新 App。"}
    </Text>
  );
}
