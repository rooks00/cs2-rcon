# Verification

Verified on September 5, 2026.

- ESLint: passed with no warnings or errors.
- Vitest: 65 tests across 9 files passed.
- TypeScript and Next 16.3.3 production build: passed.
- Docker multi-stage production build and Compose configuration validation: passed.
- Running production containers: healthy; process runs as user `node`.
- Default production installation serves the app, fonts, illustration, guide, and keyless runtime capability. A legitimate browser origin passes validation while a private destination remains blocked by default.
- Production Docker browser-to-TCP fixture: JSON import, native authentication, status parsing, raw console command, incorrect-password error, disconnect/reconnect, password excluded from storage by default, and explicitly remembered password all passed.
- Browser smoke checks: malformed JSON, field aliases, player/map search, map favorites, map and kick confirmation cancellation, game-mode view, ban retrieval, Tab command completion and console execution passed.
- Desktop/laptop checks: 1440×1000 and 1366×768. The primary connection action fits the laptop viewport.
- Mobile checks: 390×844; connection, JSON form, dashboard, native modal, navigation and guide. No horizontal page overflow in the checked views.
- Native dialog Escape handling and focus containment use the browser's modal dialog implementation. Reduced-motion mode exercised during screenshot checks.
- `git diff --check`: passed.

The container-origin regression is covered by a test: Next can rewrite a route request URL to its internal listen address, so origin validation preserves the incoming Host authority without accepting `x-forwarded-host`.

Expected HTTP 401 responses were exercised for bad passwords. No JavaScript page exceptions occurred in the completed smoke runs. Visual inspection sampled the connection, overview, console, mobile connection/JSON/dashboard and dialog screens; this is not an exhaustive accessibility audit or cross-browser certification.

The TCP fixture is a local protocol-compatible test server, not a running CS2 game process. Real-server command compatibility, firewall/routing behavior, Vercel deployment egress and a public TLS reverse proxy have not been tested against user infrastructure.
