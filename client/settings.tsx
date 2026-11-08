import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSwitch,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { testRpc, type NudgeTarget } from "../shared/nudge";
import { preferences, type Preferences } from "../shared/settings";

export function NudgeSettings({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  const test = useRpc(testRpc);
  const toast = useToast();
  const ready = settings.status === "ready" ? settings.values : null;
  const revision = settings.status === "ready" ? settings.revision : "";
  const [desktopMessage, setDesktopMessage] = useState("");
  const [phoneMessage, setPhoneMessage] = useState("");

  useEffect(() => {
    if (!ready) return;
    setDesktopMessage(ready.desktop.message);
    setPhoneMessage(ready.phone.message);
  }, [revision, ready]);

  async function save(next: Preferences) {
    if (settings.status !== "ready") return false;
    const saved = await settings.save(next, settings.revision);
    if (!saved) toast.error(settings.saveError ?? "没有保存成功");
    return saved;
  }

  function draft(base: Preferences): Preferences {
    return {
      desktop: {
        ...base.desktop,
        message: desktopMessage.trim().slice(0, 400) || base.desktop.message,
      },
      phone: {
        ...base.phone,
        message: phoneMessage.trim().slice(0, 400) || base.phone.message,
      },
    };
  }

  async function saveText() {
    if (!ready) return;
    if (!desktopMessage.trim() || !phoneMessage.trim()) {
      toast.error("提示词不能为空");
      return;
    }
    const saved = await save(draft(ready));
    if (saved) toast.show("已保存对话完成提醒设置", { variant: "success" });
  }

  async function sendTest(target: NudgeTarget) {
    try {
      const result = await test({ target });
      if (result.delivered) toast.show(result.detail, { variant: "success" });
      else toast.error(result.detail);
    } catch {
      toast.error("测试没有发出去");
    }
  }

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>正在读取设置</Text>;
  }
  if (settings.status !== "ready" || !ready) {
    return (
      <Text style={{ color: theme.colors.foreground }}>
        {settings.status === "error" ? settings.error : "设置读取失败。可以重载插件后再试。"}
      </Text>
    );
  }

  const here = Platform.OS === "ios" || Platform.OS === "android" ? "手机" : "电脑";
  const phone = (
    <SettingsSection title="手机">
      <SettingsCard>
        <SettingsSwitch
          label="手机对话完成提醒"
          hint="手机前台显示 Paseo 内的弹窗；手机后台运行时发送系统横幅。"
          value={ready.phone.enabled}
          onValueChange={(enabled) =>
            void save({ ...draft(ready), phone: { ...draft(ready).phone, enabled } })
          }
        />
        <SettingsSwitch
          label="强提醒"
          hint="将手机通知标记为高优先级。手机系统仍可以拦住它。"
          value={ready.phone.strong}
          onValueChange={(strong) =>
            void save({ ...draft(ready), phone: { ...draft(ready).phone, strong } })
          }
        />
        <SettingsInput
          key={`phone-message-${revision}`}
          label="手机提示词"
          hint="写进手机弹窗和横幅正文。"
          initialValue={ready.phone.message}
          onChangeText={setPhoneMessage}
        />
        <SettingsAction
          label="测试手机后台通知"
          actionLabel="测试"
          onPress={() => void sendTest("phone")}
        />
      </SettingsCard>
    </SettingsSection>
  );
  const desktop = (
    <SettingsSection title="电脑">
      <SettingsCard>
        <SettingsSwitch
          label="电脑对话完成提醒"
          hint="电脑前台显示 Paseo 内的弹窗；窗口切走或最小化后发送系统通知。"
          value={ready.desktop.enabled}
          onValueChange={(enabled) =>
            void save({ ...draft(ready), desktop: { ...draft(ready).desktop, enabled } })
          }
        />
        <SettingsSwitch
          label="电脑声音"
          hint="后台系统通知使用系统提示音。"
          value={ready.desktop.sound}
          onValueChange={(sound) =>
            void save({ ...draft(ready), desktop: { ...draft(ready).desktop, sound } })
          }
        />
        <SettingsInput
          key={`desktop-message-${revision}`}
          label="电脑提示词"
          hint="写进电脑弹窗和系统通知正文。"
          initialValue={ready.desktop.message}
          onChangeText={setDesktopMessage}
        />
        <SettingsAction
          label="测试电脑后台通知"
          actionLabel="测试"
          onPress={() => void sendTest("desktop")}
        />
      </SettingsCard>
    </SettingsSection>
  );

  return (
    <>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: layout.compact ? 14 : 15,
          lineHeight: 22,
        }}
      >
        当前是{here}。提醒只在对话结束时触发；前台显示 Paseo 内弹窗，后台运行时使用系统通知。
      </Text>
      {phone}
      {desktop}
      <SettingsSection title="提示词">
        <SettingsCard>
          <SettingsAction
            label="保存两边的提示词"
            actionLabel="保存"
            onPress={() => void saveText()}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
