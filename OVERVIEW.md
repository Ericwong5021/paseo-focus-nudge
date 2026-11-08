Conversation completion reminders notify you when an agent turn succeeds, fails, or is canceled. Foreground Paseo shows an in-app reminder; background phones receive a push, and background desktop windows request a system notification on the daemon computer. Changing focus alone never triggers a reminder.

Requires Paseo 0.15.3 or later. Open Paseo on the phone while connected to this daemon and allow notifications before switching apps. Phone and desktop settings have separate switches, messages, and notification options. Legacy focus settings reset when upgrading.

The server reads the daemon's private push registration file and sends Expo tokens and notification metadata to Expo over HTTPS. Error and cancellation reasons may appear in the notification body. No conversation transcript is sent. All unexpired phone tokens registered on this daemon receive the push.

Banner display depends on system notification permissions, Focus modes, and Android channel importance. The plugin cannot override these settings. Old mobile hosts use an in-app alert rather than a toast. Background presence is retained for up to 24 hours and clears after plugin reload or daemon restart; reopen Paseo to register again. Foreground reminders poll every 1.5 seconds. Desktop system delivery supports macOS and Linux; remote desktop notifications appear on the daemon machine.
