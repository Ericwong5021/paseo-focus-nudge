# Contributing

Bug reports, translations, documentation fixes, and focused pull requests are welcome. English and Chinese are both welcome in issues and pull requests.

## Before changing behavior

Open an issue for a new notification service, new stored setting, or a change to the default trigger. Describe the problem and intended behavior. Small bug fixes and documentation corrections can go straight to a pull request.

## Development

Use Node.js 22.13 or later and npm. Run:

```sh
npm ci
npm run typecheck
npm test
npm pack --dry-run
```

Install the local directory with `paseo plugin install "$PWD"`, then run `paseo plugin reload focus-nudge` after edits. Do not restart the daemon just to reload a plugin.

Keep client code in `client/`, Node code in `server/`, and shared contracts in `shared/`. The root has only the two runtime entries and project metadata. Stay compatible with the minimum Paseo version in the manifest; do not replace missing host APIs with type casts that hide a runtime failure.

## Pull requests

Use one pull request per problem. Explain what changed, why, and which checks ran. For lifecycle or notification changes, describe the phone/desktop OS, Paseo version, foreground/background scenarios, and any manual testing still needed. Mock tests do not prove a real banner appeared.

Keep transcripts, tokens, host configuration, private paths, and screenshots containing personal data out of issues, fixtures, and logs. New transports must document what data leaves the daemon and where it goes. Do not add telemetry or send real notifications from CI.

Maintainers review changes for correctness, SDK compatibility, and the amount of configuration they introduce. Public APIs and settings migrations need a compatibility explanation. There is no guaranteed review or support response time.

Contributions are provided under the repository's MIT license. By opening a pull request, you confirm that you can contribute the submitted work under that license. No CLA is required.
