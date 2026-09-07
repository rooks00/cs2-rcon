# CS2 RCON

A browser workspace for managing Counter-Strike 2 servers: console commands, players, bans, maps, Workshop maps, and match controls. No account or database required.

[![CI](https://github.com/rooks00/cs2-rcon/actions/workflows/ci.yml/badge.svg)](https://github.com/rooks00/cs2-rcon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/rooks00/cs2-rcon?style=social)](https://github.com/rooks00/cs2-rcon/stargazers)

[Open the app](https://cs.rooks.zip) · [Star on GitHub](https://github.com/rooks00/cs2-rcon) · [Report a bug](https://github.com/rooks00/cs2-rcon/issues)

## Connect

Enter your server address, **TCP** RCON port (usually `27015`), and RCON password. Or try the interactive demo without a server.

- **Hosted connection:** the website's server connects to your CS2 server.
- **Use this device:** run the portable helper on your computer to reach LAN/VPN servers. Pair it with the current website using its temporary token, or open the helper's local workspace if your browser blocks local access. See [the helper guide](helper/README.md).

The helper runs in the foreground on Windows, macOS, and Linux; no Docker, Node.js, or administrator privileges are needed. Stop it with **Ctrl+C**.

## Features

- Console with command history, completion, and server command discovery
- Player management, kick/ban actions, and Steam/IP ban lists
- Installed maps, favorites, Workshop lookup, and map loading
- Game modes, restart, warmup, pause, and broadcast controls
- Browser-local profiles and JSON connection imports
- Responsive interface, reduced-motion support, and locally served fonts

Source RCON cannot start an offline game server or manage its files.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. No `.env` file is required. For production:

```sh
npm run build
npm start
```

Or use Docker:

```sh
docker compose up --build -d
```

Docker binds to `127.0.0.1:3000`. For public hosting, configure HTTPS and the deployment controls described in [the deployment guide](docs/deployment.md) and [.env.example](.env.example).

## Import a connection

Choose **Paste JSON**, then review the imported values before connecting.

```json
{
  "name": "My server",
  "host": "cs2.example.com",
  "port": 27015,
  "password": "your-rcon-password"
}
```

Imports also support common field aliases, nested `rcon`/`server` objects, and lists of up to 50 profiles. Importing never automatically remembers passwords.

## Privacy and security

Passwords stay in memory unless you choose to remember them. Remembered secrets use unencrypted browser storage. Safe profile exports omit passwords and installation keys, but command history may contain sensitive text.

With a hosted connection, the website processes your RCON password. With the helper, RCON runs on your computer. HTTPS protects browser-to-website traffic; **Source RCON itself is unencrypted**. Use a trusted host or VPN and restrict the game server's firewall accordingly.

Public deployments need platform/proxy limits and outbound firewall controls in addition to the application's per-process safeguards. See [deployment boundaries](docs/deployment.md#limits-and-data-handling) and [security reporting](SECURITY.md).

## Development and releases

```sh
npm run lint
npm test
npm run build
npm run helper:test # requires Go
```

See [contributing](CONTRIBUTING.md), [release instructions](docs/releases.md), and [the helper build guide](helper/README.md#build-and-test).

## License

[MIT](LICENSE). Bundled fonts retain their licenses in `public/fonts/`; the helper includes the [Go runtime license](public/relay/LICENSE-GO.txt). Counter-Strike and Steam belong to Valve; this is an independent community project.
