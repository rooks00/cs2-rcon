# Deployment guide

The website needs a Node.js runtime with outbound TCP support. Static and edge-only hosts cannot run its RCON route. The Docker build uses Node 26 and enables `RELAY_STANDALONE=1`; leave that variable unset on ordinary Node and Vercel deployments.

For a public deployment, put an HTTPS reverse proxy in front of the application, set `RCON_PUBLIC_ORIGIN` to its exact public origin, and configure request limits and outbound firewall rules. The included Compose file binds only to `127.0.0.1:3000`.

```sh
docker compose up --build -d
```

No account, database, or separate worker is required. An unset `RCON_RELAY_SECRET` permits keyless access to the relay: callers still need the game server's RCON password. Set a strong installation key when restricting access to a private deployment.

## Prepare your game server

A typical dedicated-server launch includes:

```bash
./cs2 -dedicated -console -usercon -port 27015 +map de_mirage
```

Configure the password in the server configuration loaded at startup:

```cfg
rcon_password "replace-with-a-long-random-password"
```

Allow the server's **TCP** RCON port through its firewall from the application host. A game's UDP port allowance alone does not enable TCP RCON. The address must be reachable from the application host; this can differ from your browser's network. Some providers expose a proprietary console rather than Source RCON—ask for a native TCP RCON endpoint.

HTTPS protects browser → app. Source RCON does **not** encrypt app → game server. Use a trusted installation, preferably beside the game server or through a private network/VPN, and restrict the game-server firewall to the application's egress address.

### LAN and local servers

For end users, the native helper reaches local and VPN servers without these deployment settings. The settings below apply only when self-hosting the full website.

Development permits RFC1918 and loopback destinations by default. Production blocks them unless both of these are explicitly configured:

```dotenv
RCON_ALLOW_PRIVATE=true
RCON_ALLOWED_HOSTS=192.168.1.50
```

The allowlist must contain the exact host entered by the user; wildcard entries do not grant private-network access. Keep such installations on a trusted network or behind access control. Container loopback refers to the container, not the host or a neighboring container. Link-local metadata, multicast, and reserved destinations remain blocked in all modes.

## Deployment controls

All settings are optional. See [.env.example](../.env.example).

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

## Node runtime

Development and Docker use Node 26 (`nvm use` reads `.nvmrc`). CI tests Node 26 and Node 24. Vercel Functions currently supports Node 24, so `engines.node` permits both major versions to keep hosted deployments working. Vercel selects its newest available compatible runtime; upgrade its runtime to 26 when Functions supports it. Node 26 support in Vercel Sandbox is separate from Functions.

See [Vercel’s supported Functions runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
