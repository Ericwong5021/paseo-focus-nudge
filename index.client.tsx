import type { PluginClientContext } from "@getpaseo/plugin/client";
import { NudgeSettings } from "./client/settings";
import { startCompletionWatch } from "./client/watch";
import { NativeBubbleBridge, OpenConversation } from "./client/bubble";

export default function contribute(client: PluginClientContext) {
  client.addSidebarHeaderItem({
    id: "bubble-bridge",
    title: "对话完成气泡",
    Component: NativeBubbleBridge,
  });
  client.addScreen({ id: "open-conversation", title: "打开对话", Component: OpenConversation });
  client.addSettingsScreen({
    id: "nudge",
    title: "对话完成提醒",
    icon: "Bell",
    Component: NudgeSettings,
  });
  client.addCommandCenterItem({
    id: "open-focus-nudge",
    title: "对话完成提醒设置",
    icon: "Bell",
    keywords: ["conversation", "complete", "notification", "对话", "完成"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("nudge");
    },
  });
  return startCompletionWatch(client);
}
