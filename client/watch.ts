import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AppState, Platform } from "react-native";
import { isDocumentHidden, showDocumentToast, subscribeDocumentVisibility } from "./web";
import { showNativeBubble } from "./bubble";
import { disconnectRpc, syncRpc, type TurnFinishedEvent } from "../shared/nudge";

export function startCompletionWatch(client: PluginClientContext): () => void {
  const phone = Platform.OS === "ios" || Platform.OS === "android";
  const target = phone ? "phone" : "desktop";
  const clientId = `${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let stopped = false;
  let inFlight = false;
  let pending = false;
  let cursor: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isBackground = () =>
    phone
      ? AppState.currentState === "background" || AppState.currentState === "inactive"
      : isDocumentHidden();
  const show = (event: TurnFinishedEvent) => {
    const title = event.agentTitle || "对话已结束";
    const onPress = () =>
      client.openScreen({ screenId: "open-conversation", params: { agentId: event.agentId } });
    const durationMs = event.dismissSeconds * 1000;
    if (phone) {
      showNativeBubble({
        title,
        message: event.message,
        durationMs,
        failed: event.outcome.kind === "failed",
        onPress,
      });
    } else {
      showDocumentToast(title, {
        message: event.message,
        durationMs,
        placement: "bottom-end",
        onPress,
      });
    }
  };
  const sync = async () => {
    if (stopped) return;
    if (inFlight) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    inFlight = true;
    const background = isBackground();
    try {
      const result = await client.rpc(syncRpc, { clientId, target, background, after: cursor });
      if (stopped) return;
      cursor = result.cursor;
      if (!phone || (!background && !isBackground()))
        for (const event of result.events) show(event);
    } catch (error) {
      if (!stopped) console.warn("[focus-nudge] Completion sync failed", error);
    } finally {
      inFlight = false;
      if (!stopped) {
        if (pending) {
          pending = false;
          void sync();
        } else if (!phone || !isBackground()) timer = setTimeout(() => void sync(), 1500);
      }
    }
  };
  const changed = () => {
    void sync();
  };
  const appSubscription = AppState.addEventListener("change", changed);
  const removeVisibility = subscribeDocumentVisibility(changed);
  void sync();
  return () => {
    stopped = true;
    clearTimeout(timer);
    appSubscription.remove();
    removeVisibility();
    void client.rpc(disconnectRpc, { clientId }).catch(() => {});
  };
}
