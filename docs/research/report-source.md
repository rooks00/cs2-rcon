# Native CS2 connections without a separate relay

Research date: September 5, 2026. Audience: Relay maintainers and server owners. Decision: deliver public-browser onboarding using only game-server credentials, with an independently deployable application. Scope excludes proprietary hosting consoles, host file/process management, and adding required client software.

## Finding

The feasible cross-browser implementation is **browser HTTPS → this application's Node server → Source RCON TCP**. No external worker or mandatory installation key is needed. The server's RCON password remains necessary. Pure static browser-only native RCON is not available to ordinary web pages.

This follows from the original [Valve RCON protocol specification](https://www.mail-archive.com/hlds_apps@list.valvesoftware.com/msg00604.html), [Chrome's raw-socket restrictions](https://developer.chrome.com/docs/iwa/direct-sockets), and the TCP client API in [Node `net`](https://nodejs.org/docs/latest-v22.x/api/net.html). It is an architecture conclusion drawn from those sources, not a claim that browsers gained TCP access.

## Alternatives examined

| Approach | Native RCON compatibility | What visitors or operators would need | Decision |
| --- | --- | --- | --- |
| Ordinary browser JavaScript or WebAssembly | No raw socket API; WASM has the host environment's network capabilities | A translating service remains necessary | Cannot satisfy static-only TCP |
| WebSocket | HTTP handshake and framed messages, unlike RCON | WebSocket-to-RCON server | Unnecessary additional component |
| WebTransport | Negotiated WebTransport endpoint over HTTP/3 or HTTP/2, unlike RCON | Compatible protocol server and translation | Does not bypass the browser restriction |
| WebRTC data channel | SCTP/DTLS/ICE stack, unlike RCON | A compatible peer translating to RCON | More infrastructure and signaling |
| Direct Sockets / IWA | Actual TCP is possible in an eligible isolated context | Installation, signing, and restricted platform/distribution eligibility | Does not meet “anyone can just browse” |
| Desktop/native helper | A native runtime can open TCP | Download/install, local service or app | Useful alternate product, outside this browser-first scope |
| Integrated Node route | Native TCP via `node:net` | One application host reachable from the game server | Implemented baseline |

Protocol evidence: [IETF RFC 6455, WebSocket](https://www.rfc-editor.org/info/rfc6455/), [W3C WebTransport, July 30, 2026](https://www.w3.org/TR/webtransport/), and [IETF RFC 8831, WebRTC data channels](https://www.rfc-editor.org/info/rfc8831/). The WebTransport snapshot explicitly includes HTTP/2 as well as HTTP/3; describing it as QUIC-only would be incomplete. Comparing these negotiated/framed transports with RCON establishes incompatibility without translation.

Chrome documents Direct Sockets for explicitly installed IWAs, not normal sites. Its [IWA introduction](https://developer.chrome.com/docs/iwa/introduction) describes initial high-trust availability for enterprise-administered ChromeOS and selected partners. Its [distribution allowlist guidance](https://developer.chrome.com/docs/iwa/allowlist) adds ChromeOS installation restrictions from Chrome 143. Developer-mode flags are not evidence that an ordinary public website can use the API. Browser installation eligibility may evolve, but it does not alter the current ordinary-website boundary.

## Hosting conclusion

The repository already contained a Node TCP implementation. Its mandatory production `RCON_RELAY_SECRET` was an application policy, not a TCP requirement. The implementation now works without that environment variable; intentionally protected installations retain optional access-key compatibility.

Next's [standalone output documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) supports packaging the server with traced dependencies. `public` and `.next/static` must be copied separately. The included Dockerfile does both and runs as an unprivileged user. The [Next self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting) recommends a reverse proxy for public request and connection controls.

Vercel is an optional host. Its [Node runtime](https://vercel.com/docs/functions/runtimes/node-js) supports Node APIs, and its [function limits](https://vercel.com/docs/functions/limitations) explicitly account for TCP sockets within file descriptor limits. These documents support bounded outbound TCP requests; they do not establish that a particular CS2 endpoint's firewall, routing, or host policy will accept them. Fixed outbound firewall policies can use a predictable self-hosted address or the provider's documented [static egress feature](https://vercel.com/docs/networking/static-ips).

## Security and operational tradeoffs

Removing a shared key makes arbitrary public RCON destinations available to visitors. The password protects game-server commands, but the application still initiates a network connection before authentication. A public service can therefore face probing, brute-force attempts, resource exhaustion, or denial of service. [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) and [DoS prevention](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) support the destination validation, DNS checks, bounded resource use, and infrastructure controls applied here.

Implemented controls:

- Validate every DNS answer, including IPv4-mapped IPv6, and connect to the selected numeric IP without another lookup. Reject local, metadata, reserved and transition ranges by default.
- Private production destinations require an explicit flag and an exact host allowlist. This remains an administrator trust decision; keep private installations on trusted networks or behind access control.
- Reject cross-site browser requests and untrusted forwarded-origin substitutions. Same-origin checks are not bot authentication.
- Enforce actual streamed body size, strict command validation, DNS and socket deadlines, total request cancellation, and response budgets.
- Bound requests and sockets per process and destination; back off after repeated authentication failures. Memory limits are not shared across hosts and reset on restart. Public deployments need proxy/platform limits and outbound firewall controls as well.
- Keep passwords in browser memory by default, exclude profile secrets from safe exports, avoid body logging, and mark API responses non-cacheable.

The password travels from the browser to the application's host. HTTPS protects that leg. The RCON authentication packet itself carries the password without encryption; the [original Valve format](https://www.mail-archive.com/hlds_apps@list.valvesoftware.com/msg00604.html) describes the wire payload, and [python-valve's implementation documentation](https://python-valve.readthedocs.io/en/0.1.0/rcon.html) explicitly notes plaintext transport and failure-triggered IP bans. Use a trusted host and preferably a private network or VPN for the final hop. Do not claim that passwords never leave the browser or that HTTPS encrypts the game-server connection.

## Implemented visitor experience

The connection workspace accepts a host/IP, TCP port, and RCON password. JSON imports recognize common aliases, nested configurations, server arrays and safe Relay exports. Users review one imported profile before connecting. Imports do not opt into password persistence. Connection errors explain authentication, routing, invalid input and limits, and demo data is explicitly labeled.

The app authenticates and reads status before opening the main RCON console. Players, maps, Workshop, game modes, bans, match actions and console tools retain the existing RCON functionality. Native dialogs constrain keyboard focus and support Escape. Typography is self-hosted, and the interface uses neutral translucent surfaces with the requested controllable particle-whale background.

## Limits and verification

A normal static hosting service cannot run the TCP route. A public installation cannot reach a visitor's LAN; Relay must run on a network that can reach the server. Standard RCON does not start a stopped process, expose host file operations, or provide a continuous incoming chat stream. Polling and short-lived socket transactions remain the supported model.

Verification passed: 65 automated tests, lint, production and Docker builds, container health checks, browser-to-container-to-TCP authentication and commands, JSON imports, error and password-persistence handling, and sampled desktop/mobile workflows. The TCP fixture exercised the built-in production route without an installation key. This does not substitute for connecting to a configured CS2 server on the intended production network. No real server credentials or production deployment were available for that test.

Research stopped when primary protocol specifications and current first-party browser/hosting documentation resolved the decision. The Valve Developer Community wiki returned HTTP 403; the archived original protocol specification was used instead. No material contradiction remained; platform eligibility and hosting egress can change and should be rechecked when deploying.

## Follow-up: lightweight native helper and Vercel packaging

The follow-up request adds optional native software, changing the original exclusion of client installation. Relay now offers a small foreground Go executable for six OS/CPU targets. A one-line launcher downloads and verifies it in a temporary directory. It serves the existing website UI through an authenticated loopback workspace and handles `/api/rcon` on the user's machine. It needs no Docker or language runtime and stops with its terminal session. The hosted route remains the default.

Serving the interface at the loopback origin avoids browser-to-localhost cross-origin requests entirely. This is a deliberate response to [Chrome Local Network Access restrictions](https://developer.chrome.com/blog/local-network-access) and [browser mixed-content policies](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content); it does not disable browser checks or claim universal localhost exceptions. UI assets and optional Workshop metadata still require the configured website. The helper's launch pairing and application session are automatic, ephemeral, and never forwarded to that website.

The reported Vercel `next-server.js.nft.json` failure matches the [Next 16.3 adapter/standalone conflict](https://github.com/vercel/next.js/issues/96646), also described with a reproduction in [the related upstream issue](https://github.com/vercel/next.js/issues/96657). Inspection of the installed Next build code confirmed the standalone copy step still reads this trace while adapter builds omit it. Standalone packaging is now opt-in through `RELAY_STANDALONE=1` in the Docker build. Normal and Vercel builds use normal output. A real adapter smoke build verifies the hosted RCON route is present, so testing no longer relies on `VERCEL=1` alone.
