import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_MESSAGE = "对话已结束，回来查看结果。";

export const desktopProfile = z.object({
  enabled: z.boolean().default(true),
  message: z.string().default(DEFAULT_MESSAGE),
  sound: z.boolean().default(true),
});

export const phoneProfile = z.object({
  enabled: z.boolean().default(true),
  message: z.string().default(DEFAULT_MESSAGE),
  strong: z.boolean().default(false),
});

const desktopDefaults = {
  enabled: true,
  message: DEFAULT_MESSAGE,
  sound: true,
};

const phoneDefaults = {
  enabled: true,
  message: DEFAULT_MESSAGE,
  strong: false,
};

export const preferences = defineSettings({
  id: "nudge",
  scope: "host",
  version: 3,
  schema: z.object({
    desktop: desktopProfile.default(desktopDefaults),
    phone: phoneProfile.default(phoneDefaults),
  }),
  // v3 intentionally resets the old focus-based settings to the completion reminder defaults.
  migrate() {
    return { desktop: desktopDefaults, phone: phoneDefaults };
  },
});

export type DesktopProfile = z.output<typeof desktopProfile>;
export type PhoneProfile = z.output<typeof phoneProfile>;
export type Preferences = z.output<typeof preferences.schema>;
