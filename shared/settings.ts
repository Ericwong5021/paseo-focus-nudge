import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_MESSAGE = "对话已结束，回来查看结果。";
export const DEFAULT_DISMISS_SECONDS = 5;
export const MIN_DISMISS_SECONDS = 1;
export const MAX_DISMISS_SECONDS = 30;

export const dismissSeconds = z
  .number()
  .int()
  .min(MIN_DISMISS_SECONDS)
  .max(MAX_DISMISS_SECONDS)
  .default(DEFAULT_DISMISS_SECONDS);

export const desktopProfile = z.object({
  enabled: z.boolean().default(true),
  message: z.string().default(DEFAULT_MESSAGE),
  sound: z.boolean().default(true),
  dismissSeconds,
});

export const phoneProfile = z.object({
  enabled: z.boolean().default(true),
  message: z.string().default(DEFAULT_MESSAGE),
  strong: z.boolean().default(false),
  dismissSeconds,
});

const desktopDefaults = {
  enabled: true,
  message: DEFAULT_MESSAGE,
  sound: true,
  dismissSeconds: DEFAULT_DISMISS_SECONDS,
};

const phoneDefaults = {
  enabled: true,
  message: DEFAULT_MESSAGE,
  strong: false,
  dismissSeconds: DEFAULT_DISMISS_SECONDS,
};

export const preferences = defineSettings({
  id: "nudge",
  scope: "host",
  version: 4,
  schema: z.object({
    desktop: desktopProfile.default(desktopDefaults),
    phone: phoneProfile.default(phoneDefaults),
  }),
  // v3 reset the old focus-based settings. v4 adds the in-app bubble lifetime.
  migrate(previous, fromVersion) {
    const source = fromVersion >= 3 && previous && typeof previous === "object" ? previous : {};
    const desktop = "desktop" in source && source.desktop ? source.desktop : {};
    const phone = "phone" in source && source.phone ? source.phone : {};
    return {
      desktop: { ...desktopDefaults, ...(typeof desktop === "object" ? desktop : {}) },
      phone: { ...phoneDefaults, ...(typeof phone === "object" ? phone : {}) },
    };
  },
});

export type DesktopProfile = z.output<typeof desktopProfile>;
export type PhoneProfile = z.output<typeof phoneProfile>;
export type Preferences = z.output<typeof preferences.schema>;
