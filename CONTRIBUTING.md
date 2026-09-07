# Contributing

Open an issue describing a bug or proposed change, or submit a focused pull request with its purpose and validation. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Local development

Use Node.js 22 or newer. Run `npm ci` and `npm run dev`. Read [AGENTS.md](AGENTS.md) and the installed Next.js documentation before changing framework code: this project uses APIs that may differ from older releases.

Before submitting changes, run:

```sh
npm run lint
npm test
npm run build
```

For helper changes, also run `npm run helper:test` with Go installed. See [helper/README.md](helper/README.md) for binary builds. Add meaningful regression tests for behavior changes; never include real RCON credentials, private server addresses, or sensitive console output in fixtures or screenshots.

Describe UI changes with a screenshot when useful. Mention checks you could not run. Do not silently replace published helper archives; follow [the release guide](docs/releases.md).

Contributions are provided under the project's [MIT license](LICENSE).
