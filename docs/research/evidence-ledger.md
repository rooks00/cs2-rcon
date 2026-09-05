# Research provenance and gap matrix

Access date: 2026-09-05. Scope assumed: ordinary public browsers, no visitor installation, native CS2 RCON, one application deployment. Discovery covered browser transport families and hosting/runtime/security; follow-up resolved IWA distribution, WebTransport HTTP/2, TCP egress, and DNS restrictions. Planning tool discovery found no available update_plan tool, so scope and completion are recorded here.

| Claim | Source / publisher / date | Confidence / access notes / resolution |
| --- | --- | --- |
| Ordinary sites cannot open raw TCP | [Direct Sockets — Google](https://developer.chrome.com/docs/iwa/direct-sockets), updated 2025-12-17 | High, parent independently inspected; IWA exception isolated from general web |
| IWA eligibility and distribution constraints | [IWA introduction — Google](https://developer.chrome.com/docs/iwa/introduction), 2026-02-06; [allowlist — Google](https://developer.chrome.com/docs/iwa/allowlist), 2025-10-15 | High for documented rollout; future expansion does not imply ordinary sites gain eligibility |
| Socket interface requires isolated context | [Direct Sockets — WICG](https://wicg.github.io/direct-sockets/), living draft | High, draft feature status retained |
| RCON TCP and password authentication | [Source RCON format — Alfred Reynolds, Valve hlds_apps](https://www.mail-archive.com/hlds_apps@list.valvesoftware.com/msg00604.html), 2004-08-22 | Original authored protocol message in archive; developer wiki 403; historical protocol, not claim of current command availability |
| WebSocket handshake/framing | [RFC 6455 — IETF](https://www.rfc-editor.org/info/rfc6455/), 2011-12 | High, incompatible with RCON without translation |
| WebTransport requires compatible negotiated endpoint | [WebTransport — W3C](https://www.w3.org/TR/webtransport/), 2026-07-30 | High, parent inspected; includes HTTP/3 and HTTP/2 |
| WebRTC stack | [RFC 8831 — IETF](https://www.rfc-editor.org/info/rfc8831/), 2021-01 | High, SCTP over DTLS/ICE; no raw socket substitution |
| Node TCP and close behavior | [Net — Node.js 22](https://nodejs.org/docs/latest-v22.x/api/net.html), maintained version docs | High; parent also inspected current net docs and installed code |
| Standalone and reverse proxy | [Output — Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), 2025-10-08; [self-hosting](https://nextjs.org/docs/app/guides/self-hosting), 2026-08-25 | High; locally installed 16.3.3 docs read before implementation |
| Vercel Node APIs and TCP limits | [Node runtime — Vercel](https://vercel.com/docs/functions/runtimes/node-js), 2026-08-11; [limits](https://vercel.com/docs/functions/limitations), 2026-08-24 | High API support; real network connectivity untested |
| Fixed egress availability | [Static IPs — Vercel](https://vercel.com/docs/networking/static-ips), 2026-06-30 | High; feature recommendation carries no pricing assumption |
| Plain RCON hop / failure bans | [python-valve RCON](https://python-valve.readthedocs.io/en/0.1.0/rcon.html), undated implementation docs, plus original Valve format | High; UI states hop boundary explicitly |
| SSRF and resource controls | [SSRF — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html); [DoS — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html), undated living guidance | High; per-process limiter limitation disclosed |

Stages: discovery complete; targeted follow-up complete; synthesis complete. Implementation and artifact verification recorded in project validation. Remaining external gap: no real CS2 endpoint or deployed-host egress test. Additional broad searching would not change the browser/protocol decision.

Final verification complete: 65 automated tests, lint, production build, Docker build/health checks, container browser-to-TCP fixture, and sampled desktop/mobile UI checks passed. See `docs/validation.md`. Research report links and artifact files were read back. The real-CS2/deployed-network gap remains explicitly disclosed.
