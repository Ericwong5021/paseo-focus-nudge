# Security policy

Only the latest default-branch version is maintained. This is a trusted Paseo plugin, not a sandbox: its server entry can access the daemon user's files and network.

Use GitHub's **Report a vulnerability** option in the repository's Security tab for sensitive reports. If that option is unavailable, open an issue asking for a private reporting channel without including the exploit, tokens, transcripts, or credentials. There is no guaranteed response time.

Include the affected commit, Paseo and OS versions, a minimal reproduction, and impact. Use synthetic credentials and redacted data. Do not test against someone else's daemon or Expo token, or send unsolicited notifications to other devices.

Expected data flow: the plugin reads Paseo's local push registration file and sends notification metadata and tokens to Expo over HTTPS. It does not need your model-provider API keys or a new push-service account.
