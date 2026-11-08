# Paseo Focus Nudge

Conversation completion reminders for [Paseo](https://paseo.sh). Keep the plugin ID `focus-nudge`; notifications now follow the end of an agent turn.

[简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [License](LICENSE)

## Behavior

| Device state | Reminder |
| --- | --- |
| Paseo in the foreground on iOS / Android | Non-blocking, tappable toast at the top of the app |
| Paseo in the foreground on desktop / browser | Tappable bubble rising from the lower-right corner |
| Phone in the background | Expo push requesting a system banner |
| Desktop window unfocused or minimized | System notification on the daemon computer, plus a tappable in-app bubble |

Successful, failed, and canceled turns all trigger reminders. Changing focus, opening another app, or locking the phone does not itself generate a notification. Phone and desktop settings are independent, shared across clients of the same daemon. The settings UI currently uses Simplified Chinese.

## Install

Requires Paseo **0.15.3 or later** on both the daemon and app. Uses the released plugin RPC and lifecycle hook APIs; a custom Paseo build is not required.

```sh
paseo plugin install git:https://github.com/Ericwong5021/paseo-focus-nudge.git
paseo plugin ls focus-nudge
```

Enable plugins in Paseo settings first. Plugins are trusted code: the server entry runs on your daemon computer, and the client entry runs inside Paseo.

Open **Settings → Plugins → Conversation completion reminder**. Set the phone and desktop switches, messages, desktop system-notification sound, optional phone time-sensitive priority, and an in-app duration of 1–30 seconds (default 5). Open Paseo on the phone while connected to the same daemon and allow notifications before switching to another app.

```sh
paseo plugin update focus-nudge
paseo plugin logs focus-nudge
```

For local development:

```sh
git clone https://github.com/Ericwong5021/paseo-focus-nudge.git
cd paseo-focus-nudge
npm ci
npm run typecheck
npm test
paseo plugin install "$PWD"
# After editing:
paseo plugin reload focus-nudge
```

The plugin contributes an invisible sidebar component to access Paseo's existing toast layer on mobile. Keep **Conversation completion bubble** enabled in Settings → Sidebar. Taps open a registered plugin screen, which uses Paseo's surface navigation to select the completed conversation.

A plugin already configured with this ID should be updated or reloaded. Removing and reinstalling it deletes its stored settings.

## Phone acceptance check

1. With Paseo open, send a prompt and wait for the turn to end. Expect an in-app reminder.
2. Start another turn, then switch to another app. Expect a push when the turn ends.
3. Switch apps without running a turn. Expect no reminder.
4. Try a failed turn and cancel a running turn. Each should identify its outcome.

The background test button waits five seconds so you can switch apps before delivery. The settings page shows whether Expo accepted the push, the mobile push service accepted it, or delivery failed. A successful service receipt is not proof that Android displayed a notification.

## Platform limits

- iOS banners, sound, Focus modes, and time-sensitive delivery remain controlled by system notification settings. The plugin cannot force a banner when the OS disallows it.
- Android notification channels are owned by the app. Allow Paseo notifications and set its default notification category to high importance / allow pop-ups in Android settings for heads-up banners. The plugin uses the existing `default` channel, not a new channel that the installed app has never created. This plugin cannot change an installed app's native channel through the 0.15.3 SDK.
- Desktop system notifications run on the daemon computer, not on a remote browser's machine. macOS uses `osascript`; Linux needs `notify-send`. Windows desktop system delivery is not implemented.
- A foreground RPC poll runs every 1.5 seconds. The phone reports background state before suspension, and the daemon retains it for up to 24 hours. A daemon restart or plugin reload clears presence; reopen Paseo afterward. A background state update that cannot reach the daemon cannot arm push delivery.
- Phone pushes use every unexpired Expo token registered with that daemon. Multiple phones can receive the same push; token-specific routing is not available in this version.
- Rapid completions replace a desktop bubble. Native mobile reminders use Paseo's host toast renderer, including a small adapter for its ReactNode content support in 0.15.3; the published SDK types only describe string content. Test this adapter when upgrading Paseo.
- Clicking a completion notification carries both the host and conversation ID. A standalone test notification opens the host because it has no conversation ID.

## Privacy

The daemon reads its own `$PASEO_HOME/push-tokens.json` (default `~/.paseo/push-tokens.json`) to reuse Paseo's notification registration. This is an internal host file and may change in a future release. Tokens and notification title/body/event ID are sent over HTTPS to Expo's push service; no transcript or agent output is included. Error messages and cancellation reasons can appear in the notification body. Do not put secrets in reminder text.

The plugin does not log tokens, collect analytics, or send conversation transcripts. Presence and pending reminders are held in memory; preferences use Paseo's host settings store.

## Customize and collaborate

`index.server.ts` owns routing. `client/watch.ts` reports presence and displays reminders. `shared/` defines RPC contracts and settings; `server/` owns notification transports. Keep Node APIs out of client and shared code.

Fork the repository, change messages or routing, run the checks, and install your fork using a Git URL. See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md). MIT licensed; redistribution and modification are welcome.
