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
import { Linking, Platform, Text } from "react-native";
import { testRpc, pushStatusRpc, type NudgeTarget } from "../shared/nudge";
import {
  MAX_DISMISS_SECONDS,
  MIN_DISMISS_SECONDS,
  preferences,
  type Preferences,
} from "../shared/settings";

export function NudgeSettings({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  const test = useRpc(testRpc);
  const readPushStatus = useRpc(pushStatusRpc);
  const [pushDetail, setPushDetail] = useState("");
  useEffect(() => {
    let active = true;
    const update = () => {
      void readPushStatus({})
        .then((status) => {
          if (active) setPushDetail(status.detail);
        })
        .catch(() => {});
    };
    update();
    const timer = setInterval(update, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [readPushStatus]);
  const toast = useToast();
  const ready = settings.status === "ready" ? settings.values : null;
  const revision = settings.status === "ready" ? settings.revision : "";
  const [desktopMessage, setDesktopMessage] = useState("");
  const [phoneMessage, setPhoneMessage] = useState("");
  const [desktopDismiss, setDesktopDismiss] = useState("");
  const [phoneDismiss, setPhoneDismiss] = useState("");

  useEffect(() => {
    if (!ready) return;
    setDesktopMessage(ready.desktop.message);
    setPhoneMessage(ready.phone.message);
    setDesktopDismiss(String(ready.desktop.dismissSeconds));
    setPhoneDismiss(String(ready.phone.dismissSeconds));
  }, [revision, ready]);

  async function save(next: Preferences) {
    if (settings.status !== "ready") return false;
    const saved = await settings.save(next, settings.revision);
    if (!saved) toast.error(settings.saveError ?? "没有保存成功");
    return saved;
  }

  function seconds(text: string): number | null {
    const parsed = Number(text.trim());
    if (!Number.isInteger(parsed) || parsed < MIN_DISMISS_SECONDS || parsed > MAX_DISMISS_SECONDS) {
      return null;
    }
    return parsed;
  }

  function draft(base: Preferences): Preferences | null {
    const desktopSeconds = seconds(desktopDismiss);
    const phoneSeconds = seconds(phoneDismiss);
    if (desktopSeconds === null || phoneSeconds === null) {
      toast.error(`气泡消失时间要在 ${MIN_DISMISS_SECONDS} 到 ${MAX_DISMISS_SECONDS} 秒之间`);
      return null;
    }
    return {
      desktop: {
        ...base.desktop,
        message: desktopMessage.trim().slice(0, 400) || base.desktop.message,
        dismissSeconds: desktopSeconds,
      },
      phone: {
        ...base.phone,
        message: phoneMessage.trim().slice(0, 400) || base.phone.message,
        dismissSeconds: phoneSeconds,
      },
    };
  }

  async function saveText() {
    if (!ready) return;
    if (!desktopMessage.trim() || !phoneMessage.trim()) {
      toast.error("提示词不能为空");
      return;
    }
    const next = draft(ready);
    if (!next) return;
    const saved = await save(next);
    if (saved) toast.show("已保存对话完成提醒设置", { variant: "success" });
  }

  async function sendTest(target: NudgeTarget) {
    try {
      const result = await test({ target, delaySeconds: 5 });
      if (result.scheduled) toast.show(result.detail, { variant: "info", durationMs: 5000 });
      else if (result.delivered) toast.show(result.detail, { variant: "success" });
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
          hint="手机前台从顶部出现气泡；手机后台运行时发送系统横幅。点气泡打开对应对话。"
          value={ready.phone.enabled}
          onValueChange={(enabled) => {
            const next = draft(ready);
            if (!next) return;
            void save({ ...next, phone: { ...next.phone, enabled } });
          }}
        />
        <SettingsSwitch
          label="强提醒"
          hint="用于 iOS 时间敏感通知。Android 横幅取决于系统通知类别的弹出设置。"
          value={ready.phone.strong}
          onValueChange={(strong) => {
            const next = draft(ready);
            if (!next) return;
            void save({ ...next, phone: { ...next.phone, strong } });
          }}
        />
        <SettingsInput
          key={`phone-message-${revision}`}
          label="手机提示词"
          hint="写进手机气泡和横幅正文。"
          initialValue={ready.phone.message}
          onChangeText={setPhoneMessage}
        />
        <SettingsInput
          key={`phone-dismiss-${revision}`}
          label="气泡显示秒数"
          hint="前台气泡从顶部出现，到时间后自动消失。可填 3 或 5。"
          initialValue={String(ready.phone.dismissSeconds)}
          onChangeText={setPhoneDismiss}
        />
        <SettingsAction
          label="5 秒后测试手机横幅"
          actionLabel="测试"
          onPress={() => void sendTest("phone")}
        />
        {pushDetail ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 }}
          >
            {pushDetail}
          </Text>
        ) : null}
        {Platform.OS !== "web" ? (
          <SettingsAction
            label="系统通知权限与横幅"
            hint="Android 需要允许 Paseo 通知，并把通知类别设为高重要性或允许弹出。"
            actionLabel="打开设置"
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
  const desktop = (
    <SettingsSection title="电脑">
      <SettingsCard>
        <SettingsSwitch
          label="电脑对话完成提醒"
          hint="电脑前台在右下角显示气泡；窗口切走或最小化后发送系统通知。点气泡打开对应对话。"
          value={ready.desktop.enabled}
          onValueChange={(enabled) => {
            const next = draft(ready);
            if (!next) return;
            void save({ ...next, desktop: { ...next.desktop, enabled } });
          }}
        />
        <SettingsSwitch
          label="电脑声音"
          hint="后台系统通知使用系统提示音。"
          value={ready.desktop.sound}
          onValueChange={(sound) => {
            const next = draft(ready);
            if (!next) return;
            void save({ ...next, desktop: { ...next.desktop, sound } });
          }}
        />
        <SettingsInput
          key={`desktop-message-${revision}`}
          label="电脑提示词"
          hint="写进电脑气泡和系统通知正文。"
          initialValue={ready.desktop.message}
          onChangeText={setDesktopMessage}
        />
        <SettingsInput
          key={`desktop-dismiss-${revision}`}
          label="气泡显示秒数"
          hint="右下角气泡到时间后自动消失。可填 3 或 5。"
          initialValue={String(ready.desktop.dismissSeconds)}
          onChangeText={setDesktopDismiss}
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
        当前是{here}
        。提醒只在对话结束时触发。前台是一条不挡输入的气泡，点它打开对应对话，到时间后自动消失。后台使用系统通知。
      </Text>
      {phone}
      {desktop}
      <SettingsSection title="提示词">
        <SettingsCard>
          <SettingsAction
            label="保存提示词和气泡时长"
            actionLabel="保存"
            onPress={() => void saveText()}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
