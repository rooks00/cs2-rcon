# Relay

A self-contained CS2 RCON workspace. Open it, enter a server address, TCP port and RCON password, and manage your server. Paste JSON to import connection details, or explore the interactive demo.

**No account, database, separate worker, or deployment access key is required.** Relay's own Node server handles TCP. It runs locally, in Docker, or on a Node-compatible host; Vercel is optional.

## Start

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. No `.env` file is needed. For a production Node installation:

```bash
npm ci
npm run build
npm start
```

Use Node.js 22 or newer. The included Docker image uses Node 22.

```bash
docker compose up --build -d
```

Docker binds `127.0.0.1:3000`. For a public site, put an HTTPS reverse proxy in front, set `RCON_PUBLIC_ORIGIN=https://relay.example.com`, and apply request/connection limits at that proxy. No outbound worker endpoint needs configuring. See the [connection guide](app/connection-guide/page.tsx) and [architecture research](docs/connection-research.md).

## Paste JSON

Choose **Paste JSON**, paste a configuration, then **Review connection**. The fields are validated and populated; connect only after reviewing them.

```json
{
  "name": "Friday night competitive",
  "host": "cs2.example.com",
  "port": 27015,
  "password": "your-rcon-password"
}
```

Also supported:

- Address aliases: `hostname`, `address`, `ip`; embedded `host:port` and `[IPv6]:port`.
- Port aliases: `rconPort`, `rcon_port`; default `27015` when omitted.
- Password aliases: `rconPassword`, `rcon_password`; whitespace is preserved.
- Nested `rcon` / `server` objects, arrays, `{ "servers": [...] }`, and Relay's safe `{ "profiles": [...] }` exports.
- Up to 50 profiles per import. Select one to review and connect. Missing passwords can be entered in the form.

Imports never automatically remember passwords or accept an installation secret from the pasted document.

## Connection architecture

```text
Browser ── HTTPS, same origin ──> Relay's built-in Node route
                                      │
                                      └── Source RCON over TCP ──> CS2
```

An ordinary browser cannot directly open raw TCP sockets. WebSocket, WebTransport and WebRTC require compatible protocols at the other end; native Source RCON does not implement them. Chrome Direct Sockets requires an installed Isolated Web App. The practical browse-and-connect solution is the integrated Node route, not a static browser-only bundle. [Research and primary sources](docs/connection-research.md).

Each request connects, authenticates, executes a bounded batch, collects the response, and closes the socket. The user's RCON password is necessary; an additional Relay key is not.

**Existing installations:** if `RCON_RELAY_SECRET` was set previously, remove it and restart/redeploy to enable keyless access. Keeping it deliberately protects a private installation; the form reveals an access-key field only for those installations. Nothing embeds the key in the frontend.

## Prepare your game server

A typical dedicated-server launch includes:

```bash
./cs2 -dedicated -console -usercon -port 27015 +map de_mirage
```

Configure the password in the server configuration loaded at startup:

```cfg
rcon_password "replace-with-a-long-random-password"
```

Allow the server's **TCP** RCON port through its firewall from the Relay host. A game's UDP port allowance alone does not enable TCP RCON. The address must be reachable from the application host; this can differ from your browser's network. Some providers expose a proprietary console rather than Source RCON—ask for a native TCP RCON endpoint.

HTTPS protects browser → Relay. Source RCON does **not** encrypt Relay → game server. Use a trusted installation, preferably beside the game server or through a private network/VPN, and restrict the game-server firewall to the application's egress address.

### LAN and local servers

Development permits RFC1918 and loopback destinations by default. Production blocks them unless both of these are explicitly configured:

```dotenv
RCON_ALLOW_PRIVATE=true
RCON_ALLOWED_HOSTS=192.168.1.50
```

The allowlist must contain the exact host entered by the user; wildcard entries do not grant private-network access. Keep such installations on a trusted network or behind access control. Container loopback refers to the container, not the host or a neighboring container. Link-local metadata, multicast, and reserved destinations remain blocked in all modes.

## Features

- A redesigned responsive workspace with locally served typography and an original 3D map illustration
- Multiple browser-local server profiles; passwords held in memory by default
- Inline connection validation and actionable errors, password visibility, JSON import and profile selection
- Players, kick/Steam-ID ban actions, Steam/IP filters, individual and bulk unban
- Installed maps from `maps *` plus `ds_workshop_listmaps`, favorites, Steam Workshop title lookup and map loading
- Game-mode staging using `game_type` / `game_mode`, with an explicit map transition
- Match restart, warmup and pause controls, server broadcast
- Console, command history and completion, server-synced command catalogue
- Visibility-aware status polling, multi-packet and UTF-8 RCON responses
- Clearly labeled interactive demo requiring no server
- No analytics or external runtime image/font requests

CS2 sometimes exposes unavailable or provisional Steam IDs. Permanent bans are disabled until the player has a trustworthy identity. Standard RCON cannot start an offline process, manage host files, or provide an incoming live chat/log stream. Those capabilities need a game-server plugin or host integration.

## Deployment controls

All settings are optional. See [.env.example](.env.example).

| Variable | Behavior |
| --- | --- |
| `RCON_PUBLIC_ORIGIN` | Trusted public origin for a TLS-terminating reverse proxy. |
| `RCON_ALLOWED_HOSTS` | Restrict destinations to exact hosts or wildcard subdomains. |
| `RCON_ALLOWED_PORTS` | Restrict to a comma-separated list. Default permits ports 1024–65535. Explicitly list a privileged port if the server uses one. |
| `RCON_ALLOW_PRIVATE` | Production LAN/loopback access, only with an exact allowed host. |
| `RCON_TIMEOUT_MS` | Per-operation deadline, 1000–15000 ms; default 6000. |
| `RCON_RELAY_SECRET` | Optional access key for a private installation; leave unset for keyless use. |
| `RCON_ALLOW_PRIVATE_DEV=false` | Apply public-destination restrictions in development. |

Vercel's Node runtime supports outbound TCP. It can run this same application without a separate worker; configure its region and egress/firewall policy to suit the game server. A Node server or container offers more predictable network placement. Edge-only and static hosting cannot execute the `node:net` route.

### Limits and data handling

The route validates all DNS results and connects to the exact validated IP. It rejects cross-origin browser requests without trusting forwarded headers, caps the actual streamed JSON body at 100 KB, rejects malformed command batches, enforces a 25-second request deadline, caps responses, and closes sockets on cancellation.

Per Node process, there are at most 12 active requests and 240 requests/minute; per destination, 3 active sockets and 60 requests/minute. Five failed authentications cause a one-minute backoff window. These memory-only limits reset on restart and are **not distributed**. A public multi-instance deployment also needs reverse-proxy/platform limits and outbound firewall rules; origin checks do not authenticate scripts or bots. A rejected late command does not roll back earlier commands in a batch, and actions must not be blindly retried after a timeout.

Profiles and local history remain in this browser. Remembered secrets are plain `localStorage`, not encrypted. Safe exports omit profile passwords and installation keys; command history may itself contain sensitive command text, so review exports before sharing. Requests are not logged by this application and responses are marked `no-store`; configure proxy/platform logging to exclude credentials.

## Validation

```bash
npm run lint
npm test
npm run build
```

Tests include actual TCP packet framing, authentication, response assembly, keyless production requests, optional access control, cancellation, JSON imports, DNS/private-target checks, payload limits, and rate/concurrency guards. The local TCP fixture validates the protocol path; real-server and host-specific reachability still require a configured CS2 endpoint.
