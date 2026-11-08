import type { PluginClientContext } from "@getpaseo/plugin/client";
import { NudgeSettings } from "./client/settings";
import { startCompletionWatch } from "./client/watch";

export default function contribute(client: PluginClientContext) {
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
