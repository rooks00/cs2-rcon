# Relay

Relay is a local-first CS2 RCON dashboard built for GitHub + Vercel. It provides a live player list, Steam/IP ban management, bulk unban, installed-map discovery, map changes, Workshop map loading, match shortcuts, and a raw console that can execute every command exposed by the connected server.

The browser is the only persistent store. There is no account system and no database.

## How it works

```text
Browser localStorage
        │ HTTPS POST (target + one command/batch)
        ▼
Vercel Node.js Route Handler — no persistence
        │ Source RCON over TCP
        ▼
Your CS2 dedicated server
```

A normal browser cannot open the raw TCP connection required by the [Source RCON protocol](https://developer.valvesoftware.com/wiki/Source_RCON_Protocol). Relay therefore uses one short-lived Node.js function per request. The RCON password is sent to your own deployment, used in memory, and discarded when the function returns.

## Features

- Multiple browser-local server profiles, with optional secret persistence
- Live `status` + `status_json` polling with both legacy and current CS2 player formats
- Kick and permanent Steam-ID ban actions
- `listid` + `listip`, individual unban, and batched “unban all” with `writeid`/`writeip`
- Complete map discovery by merging `maps *` with `ds_workshop_listmaps`, including Workshop IDs parsed from paths and human titles resolved from Steam
- Safe stock-map `changelevel` confirmations, map favorites, and automatic `host_workshop_map <id>` routing for Workshop cards
- Dedicated game-mode manager with live `game_type`/`game_mode` values, the complete current Valve matrix, and non-disruptive staging
- Raw terminal with history, response timing, copy, and arrow-key recall
- Dynamic command catalogue synced from the server’s own `cvarlist`
- Multi-packet RCON responses, arbitrary TCP chunk boundaries, UTF-8 player names, response limits, and timeouts
- Interactive demo mode that needs no server
- Responsive desktop/mobile interface
- No analytics, cookies, external images, user accounts, or database

“All commands” means the raw console forwards any valid command your particular server exposes, including plugin commands. Relay does not pretend every command exists on every CS2 build; syncing `cvarlist` makes the reference match the live server.

The Game Modes section uses the values shipped in CS2's current `gamemodes.txt`, including Retakes at `game_type 0` / `game_mode 5`. Changing the pair only stages it for the next deliberate map transition. Relay intentionally never runs `map` or automatically reloads a level from this screen: Linux CS2 map transitions have had engine-level crash reports, and a container exposes a game-process crash as a stopped/restarted service.

CS2 does not expose one complete map-list command. Relay merges built-in maps from `maps *` with the filename-per-line Workshop inventory from `ds_workshop_listmaps`. When a Workshop ID is present in a mounted path, Relay uses `host_workshop_map <id>`; collection maps for which CS2 exposes only a filename use `ds_workshop_changelevel <name>`. Plain `changelevel` is never used for a map identified as Workshop content.

## Run locally

Requirements: Node.js 20.9 or newer and a Source-RCON-compatible CS2 server.

```bash
npm install
cp .env.example .env.local
openssl rand -hex 32
# Put the generated value in .env.local as RCON_RELAY_SECRET
npm run dev
```

Open `http://localhost:3000`, enter the same relay key in the connection dialog, then connect. Private and loopback RCON targets are allowed in development so a local CS2 server works. Set `RCON_ALLOW_PRIVATE_DEV=false` to test the production restriction locally.

Validation commands:

```bash
npm run lint
npm test
npm run build
```

## Prepare the CS2 server

Relay needs a working TCP Source RCON endpoint. A typical dedicated server launch includes:

```bash
./cs2 -dedicated -console -usercon -port 27015 +map de_mirage
```

Set a long, unique password in the server config loaded at startup:

```cfg
rcon_password "replace-with-a-long-random-password"
```

Then:

1. Allow/forward the game server’s **TCP** RCON port. The game also uses UDP, but Source RCON uses TCP.
2. Ensure the server is reachable from the public internet when using standard Vercel Functions. A LAN address such as `192.168.x.x` is intentionally rejected in production.
3. Prefer a firewall allowlist. Vercel uses dynamic outbound addresses by default; if a fixed allowlist is required, use [Vercel Static IPs or Secure Compute](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address).
4. Choose a Vercel Function region near the game server to reduce command latency.

Some managed CS2 hosts expose only a provider console or an in-game “fake RCON” plugin, not a Source RCON TCP endpoint. Those are different protocols and cannot be reached by this relay unless the host also enables Source RCON.

Recent CS2 builds sometimes return `steamid64: "0"` / `steamid: "[I:0:0]"` for a player until Steam authorization is available. Relay still shows and can kick that player by session ID, but deliberately disables the permanent-ban button until the server exposes a trustworthy Steam ID.

## Deploy from GitHub to Vercel

1. Create a GitHub repository and push this project:

   ```bash
   git init
   git add .
   git commit -m "feat: add Relay CS2 RCON dashboard"
   git branch -M main
   git remote add origin git@github.com:YOUR_NAME/YOUR_REPO.git
   git push -u origin main
   ```

2. In Vercel, choose **Add New → Project**, import the repository, and leave the detected Next.js settings unchanged. Connected Git pushes create deployments automatically.
3. Add `RCON_RELAY_SECRET` in **Project Settings → Environment Variables**. Use a random value with at least 32 bytes of entropy.
4. Optionally add `RCON_ALLOWED_HOSTS` as a comma-separated defense-in-depth list:

   ```text
   203.0.113.10,cs2.example.com,*.games.example.com
   ```

5. Optionally set `RCON_TIMEOUT_MS` from `1000` to `15000`; the default is `6000`.
6. In **Settings → Functions**, select a region close to the CS2 server. Vercel’s default is Washington, D.C. (`iad1`).
7. Deploy, open Relay, and enter the same `RCON_RELAY_SECRET` as the relay access key.

The relay key is deliberately not embedded in the frontend bundle. Anyone who has both the public site URL and this key can issue RCON requests to allowed public targets, so keep it private and rotate it if exposed.

## Security model

- Production requires `RCON_RELAY_SECRET`.
- Requests must be same-origin JSON and use a constant-time relay-key comparison.
- Hostnames are resolved before connecting; private, loopback, link-local, multicast, documentation, and reserved targets are blocked to reduce SSRF risk.
- `RCON_ALLOWED_HOSTS` can restrict the deployment to only your server names/IPs.
- Commands are capped at the Source packet limit, batches at 100 commands, responses at 2 MB, and sockets have bounded timeouts.
- API responses explicitly use `Cache-Control: no-store`.
- Security headers include CSP, frame blocking, MIME sniffing protection, a restrictive permissions policy, and no referrer leakage.
- Secrets are omitted from safe settings exports.

If “Remember secrets” is enabled, the password and relay key are plain browser `localStorage`, not encrypted. This is convenient for a trusted personal device but should not be used on a shared computer. An XSS-capable browser extension or script running on the same origin could read them.

## Stateless limitations

Relay opens a fresh TCP session for a request, then closes it. This fits Vercel Functions and means there is no durable backend state, but it does not provide a continuous server-log/chat stream. Status is polled only while the tab is visible. Long-running daemon work and persistent WebSocket/TCP sessions need a continuously running backend instead of a serverless function.

CS2 defines a `player_chat` event with a `teamonly` flag, and server logs distinguish `say` from `say_team`. Vanilla Source RCON does not expose a command that retrieves those incoming log events. Live all/team chat would require `logaddress_add_http` feeding a persistent log receiver and pub-sub/store, or a server plugin that buffers chat for polling. Relay deliberately omits this because it would violate the stateless/local-storage design.

## Research references

- [Valve Source RCON protocol](https://developer.valvesoftware.com/wiki/Source_RCON_Protocol)
- [Steam dedicated-server admin commands](https://help.steampowered.com/en/faqs/view/081A-106F-B906-1A7A)
- [Valve’s CS2 server status example](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md)
- [Current tracked CS2 gamemodes.txt](https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/gamemodes.txt)
- [Current tracked CS2 command dump](https://github.com/SteamTracking/GameTracking-CS2/blob/master/DumpSource2/commands.txt)
- [Current tracked CS2 player_chat event](https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/resource/game.gameevents)
- [Valve Linux dedicated-server map-transition crash report](https://github.com/ValveSoftware/csgo-osx-linux/issues/3577)
- [Vercel Function limits, including TCP sockets](https://vercel.com/docs/functions/limitations)
- [Vercel Git deployments](https://vercel.com/docs/deployments/overview)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
