# Relay Helper

A native console application for Windows, macOS and Linux. It requires no Docker, Node.js, Python, administrator privileges, installation directory or background service. Compressed downloads are approximately 4 MB; the executable is approximately 9–10 MB.

The main website keeps its hosted `/api/rcon` route. Users who need their own network choose **Use this device** in the connection form and copy the generated command. The command downloads an appropriate native executable, checks its SHA-256 checksum, runs it in the foreground, and removes the temporary directory on normal exit. Ctrl+C stops the program; no daemon or startup entry is created.

## Stay on the current website

Website pairing is an opt-in mode. Launch the helper using the command shown by **Use this device**, then paste its temporary pairing token into the connection form. Keep the helper running. If the browser asks for local-network access, allow it for your trusted website.

The website sends authenticated RCON requests directly to `http://127.0.0.1:47391`; the helper accepts the exact HTTPS website origin configured at launch. The token is kept in browser memory, and a restart generates a new token. Do not share it. The RCON password and commands go to the helper, not the hosted RCON route. A failed local request does not silently switch to a hosted connection.

To launch this mode manually:

```sh
./relay-helper --site https://cs.rooks.zip --browser-connect
```

The installer accepts `--browser-connect` on macOS/Linux and `-BrowserConnect` in PowerShell. This mode requires a rebuilt helper that supports the option. Browsers differ in support for HTTPS-page access to local HTTP endpoints, and browser or enterprise policy may block it. If pairing fails, launch without that option and use the local workspace below.

The helper listens on the **same computer as the browser**. Enter the CS2 server's LAN/VPN address in the normal server field; this is not a tunnel to a helper running on another LAN device.

## Local workspace

```text
Browser at http://127.0.0.1:47391
             │
             ├── UI and asset GETs ──> Helper ──> the configured Relay website
             ├── RCON requests ─────> Helper ──> your CS2 server over TCP
             └── Workshop IDs ──────> Helper ──> website metadata route
```

The browser uses the same interface on a loopback origin. This avoids depending on cross-origin browser access to local HTTP/WebSocket servers, mixed-content exceptions or local-network permissions. The website must be reachable to provide the UI; this is not an offline copy of the entire application.

The helper intercepts `/api/rcon` locally. It **never** forwards RCON passwords or commands to the website. Its only non-GET forwarding is a validated list of numeric Workshop IDs to the fixed metadata endpoint. Other POST/API routes are refused. Browser profiles remain local to this loopback origin, separate from profiles on the hosted site's origin.

## Launch

The web UI generates the command using the actual deployment's origin. For a site at `https://relay.example.com`:

macOS / Linux:

```sh
curl -fsSL 'https://relay.example.com/relay/install.sh' | sh -s -- 'https://relay.example.com'
```

Windows PowerShell:

```powershell
& ([scriptblock]::Create((irm 'https://relay.example.com/relay/install.ps1'))) -Site 'https://relay.example.com'
```

These are website placeholders, not a promised public deployment. Use the command shown on your deployed app. The launcher scripts and six archives (Intel/AMD and ARM64 for each OS) are served by that same deployment; no public GitHub repository or npm publishing is required.

An existing executable can also be run directly:

```sh
./relay-helper --site https://relay.example.com
./relay-helper --site https://relay.example.com --port 47392 --no-open
```

If the default port is occupied, close the old helper or select a different port when running the executable directly. In local-workspace mode, the helper opens the workspace automatically and also prints its URL for headless machines or browsers that fail to open. Website-pairing mode prints the token and keeps the current website open.

## Session and network boundaries

- The HTTP listener binds only to literal `127.0.0.1`; Host is checked exactly to prevent DNS rebinding.
- In local-workspace mode, a random, one-time launch URL pairs the first browser. Its secret is consumed locally, exchanged for an HttpOnly SameSite cookie, and removed from the page URL by redirect. No key is typed or configured by the user. Session material is never sent upstream, stored by the helper, or reused after restart.
- Local-workspace requests require that session. Website-pairing requests require the temporary bearer token and the exact configured website origin. Origin checks reject requests from other websites. Proxying strips cookies, authorization, Origin, Referer, relay keys and forwarded headers before fetching website assets.
- HTTP is allowed for the **website source** only during loopback development. Production website sources must be HTTPS; no certificate checks are disabled.
- LAN, loopback and VPN/Tailscale destinations are supported. All DNS answers are checked, a validated numeric IP is pinned, and metadata/link-local/reserved ranges remain blocked.
- Requests have body, command, response, operation and total deadlines, plus concurrency and per-destination limits. Cancellation and shutdown close TCP sockets.
- Source RCON is plaintext on the final TCP hop. A local helper does not encrypt that protocol; use a trusted network/VPN.
- The native builds are unsigned. OS reputation checks may appear; no launcher disables platform protections. Checksums detect a corrupt/mismatched download, not compromise of the website serving both files.

The helper is intentionally **not** a general HTTP proxy or arbitrary TCP tunnel. It only proxies UI GETs to the one website selected at launch and executes authenticated Source RCON transactions.

## Build and test

Only developers need Go. There are no third-party Go dependencies.

```sh
cd helper
go test -race ./...
go run . --site http://localhost:3000 --no-open
```

From the repository root, `npm run helper:build` cross-compiles all six targets with CGO disabled, strips debug symbols, compresses the executables, and writes checksum files plus a manifest to `public/relay/v0.2.0`. Set `RELAY_GO` to a Go executable path if necessary.

Published archives are committed with the source so Vercel can serve them without needing Go at build time. A release rebuild must bump the version in the Go default, build script, and both launchers, then regenerate all six archives. Never replace an already-published version's bytes. The manifest records the exact compiler version used. For the initial builds, the toolchain was Go 1.27.1.

CI runs the Go tests on Linux, macOS and Windows. Local validation additionally exercises the packaged Linux binary through the browser and installer. Cross-compilation is not a substitute for running macOS and Windows checks on those systems.

The compiled Go runtime is distributed under the [Go BSD license](../public/relay/LICENSE-GO.txt), also served at `/relay/LICENSE-GO.txt` by the website.
