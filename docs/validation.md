# Verification

## September 29, 2026 source review

Three parallel reviews covered the TypeScript server, React client, and Go helper/installers, followed by integration checks and a second review of connection lifecycle changes.

Resolved findings:

- **Credential routing and session lifecycle:** switching profiles could combine a new target with old credentials. Profile selection now commits after authentication. Disconnect, switching, unmount, and clearing local data cancel pending RCON requests; stale responses cannot restore an old session or overwrite the new server's data. Status polling no longer overlaps itself.
- **Untrusted data:** persisted settings now validate nested records, polling intervals, and secret preferences. Moderation identifiers require a complete valid Steam ID. JSON handlers check the exact media type, bound the complete body, and honor cancellation. Workshop upstream bodies are bounded and validated before use.
- **RCON correctness:** command-write failures no longer report a successful map-transition dispatch. Output truncation no longer interferes with response terminators, terminal errors stop subsequent writes, and decoded packet queues enforce their cap before insertion.
- **Helper distribution:** helper 0.2.3 fixes JSON validation and proxy redirects. Unix downloads cannot downgrade from HTTPS. Builds derive their version from the Go source, stage all artifacts before publication, clean failed builds, and refuse to overwrite an existing release.
- **Simplification and assets:** shared bounded JSON handling replaces duplicate parsing. Removed 6,000 unused artwork points (97,245 bytes, 30% of the JSON), with all 14,000 rendered points verified unchanged. No dependencies were added. Historical helper downloads remain available for existing versioned links.
- **Browser policy and documentation:** disabled object/frame embedding and corrected the safe-export documentation to match its existing exclusions.

Validation for this review:

- Node 26: ESLint and all 105 Vitest tests across 15 files passed, including new regressions and six-platform helper artifact checks.
- Next production build, TypeScript, hosted-adapter smoke build, and standalone packaging passed.
- Go 1.27.1: helper race tests and `go vet` passed. All six OS/architecture executables were built; the packaged Linux executable reports 0.2.3. Corrupt installer download rejection and cleanup passed.
- Chromium against the production build: demo console execution, player search, ban retrieval, server-map sync, game-mode values, opening/cancelling Add Server from demo, disconnect, mobile width, and the connection guide passed. Workshop metadata was mocked for this UI check.
- Mocked browser connection checks passed for saved profiles, authenticated profile switching, matching target/password pairs, refreshing status, and clearing local data. No JavaScript page exceptions occurred.
- Production CSP headers and unchanged rendered artwork data were checked. `npm audit` reported zero known vulnerabilities; `git diff --check` passed.

These checks used local fixtures and mocks, not a live CS2 server or a deployed public installation. macOS/Windows binaries were cross-compiled, not executed here. Existing deployment boundaries remain: plaintext Source RCON, opt-in unencrypted browser secrets, unsigned helper downloads, and per-process rather than distributed limits. The static Next pages retain inline bootstrap scripts in their CSP.

## Earlier verification

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

## Native helper follow-up

- Web checks now pass 74 tests, including six-platform archive integrity and rejection of a corrupt installer download before execution.
- The native Go protocol/security suite passes with the race detector on Linux. It covers one-time pairing, session protection, Host/Origin rejection, upstream credential stripping, body limits, local/private address policy, actual TCP framing/batches, split UTF-8, authentication failures, cancellation, level-transition disconnects and response limits.
- Cross-compiled native executables for Linux/macOS/Windows, each on amd64 and arm64. Gzip downloads are 3.51–4.00 MiB; executable sizes are 8.81–9.73 MiB. All checksums and executable format signatures are checked.
- Ran the actual one-line Unix launcher from a production Next server. It downloaded and verified the packaged Linux executable, opened an automatically paired local workspace, and completed browser JSON → native helper → TCP fixture authentication and console execution.
- Confirmed the pairing code disappears from the page URL, the cookie is HttpOnly, and RCON passwords are not saved without opt-in. Incorrect passwords produce an inline error. Hosted fallback and both OS command variants render correctly on desktop and mobile.
- Ctrl+C closed the helper's listening port and removed its downloaded executable/temp directory. The helper's initial measured resident memory was about 10 MiB in this Linux environment.
- Verified the actual Next adapter build invokes `onBuildComplete` successfully and includes `/api/rcon`. Docker explicitly opts into standalone packaging. The Vercel trace-conflict fix was pushed separately as `1a401c7`.
- macOS and Windows executables were cross-compiled, not executed on this Linux workstation; native Go tests are configured for all three operating systems in CI. The PowerShell launcher still requires a native Windows run to fully verify OS integration. No Vercel deployment status or real CS2 endpoint was available for direct confirmation.

## Reference-led UI revision

The current interface replaces the earlier illustrated overview. That earlier screenshot set is historical. RCON is now the default connected screen, seeded with the actual `status` response, with the command reference and match controls in secondary disclosures. Old raster artwork, decorative map previews, and the Barlow dependency were removed. The replacement uses locally served DM Sans and Fragment Mono plus CSS translucency.

An independent helper review found no blocking issues and rebuilt the Linux executable byte-for-byte from the checked-in source. After stopping the helper, the live browser correctly retained the original hosted fallback URL and showed local restart instructions.

The finished reference-led UI passes the complete desktop/mobile functional review: connection and JSON import, Unix/PowerShell helper launchers, console-first entry, completion/history, catalogue sync and command selection, broadcast, player search/kick cancellation, map favorites and changes, mode staging, ban filters/unban actions, and settings/export. No JavaScript runtime errors occurred in the completed runs. The prompt is fully visible on 1366×768 and 390×844; mobile player and ban tables remain contained at 390px, including after table scrolling. Initial connection notifications were removed because the connected state and actual status output already confirm success. Final lint, all 74 web tests and the actual adapter production build pass.

## Neutral theme, typography and interactive whale

The latest visual pass uses measured neutral colors from the reference, licensed Montserrat 500 headings, and enlarged interface/console text. The previous approximate blue panel colors are removed. Browser computed styles confirm a 24px backdrop blur after correcting declaration order for the CSS build transform.

An original procedural whale supplies the requested interactive scene. Browser checks passed pointer interaction, animated frames, pause/resume (including identical canvas output while paused), system reduced motion (static output even after pointer movement), and console autocomplete/execution with the scene active. The pause control lives in the header so it cannot overlap a mobile submit button. The prompt still fits at 1366×768 and 390×844 without horizontal overflow. An independent read-only review found no material lifecycle, cleanup, input-blocking or unbounded-allocation issue.

The scene uses cached geometry, displacement buffers, haze and point colors, with no per-frame React state, and stops scheduling frames in hidden tabs. It requires no extra runtime dependency or image download. Existing 74 web tests, lint/type checks and the adapter production build continue to pass.

## Tasheer artwork replacement

The whale was replaced by an original generated grayscale composition of three adult Tasheer performers, using the user-provided pose/clothing references. A seeded build-time sampler converts the source image into 9,000 portrait points; the existing renderer uses a bounded desktop/mobile subset, shallow depth and gentle drift. The old whale geometry and component names were removed.

Visual checks confirmed the three airborne figures and downward-facing rifles remain legible in the background. Browser checks passed pointer response, pause/resume (frozen canvas output while paused), reduced motion, console autocomplete/execution and mobile prompt visibility without horizontal overflow. Lint, TypeScript, all 74 existing tests and the adapter production build pass. The source and generation prompt are documented in `docs/tasheer-artwork.md`.

## Single larger Tasheer portrait

The current artwork contains exactly one original generated performer. The new source resolves carved wood, metal bands/edges and garment patterns/folds. Sampling increased from 9,000 to 20,000 points at higher resolution, with 14,000 desktop / 5,000 coarse-pointer particles and wider tonal contrast. A faint cached source layer retains microdetail beneath the interactive points.

The desktop stage measures 620px at 1440×1000 and about 483px at 1366×768, yielding roughly 450–600px of visible portrait height; the prior central figure was about 180px. Mobile uses a 320–410px stage and a header shortcut to the connection form. The image/points stay aligned, clipped to the stage, and follow scrolling without overlapping the form or headline. The source layer is omitted in the connected console.

Browser checks passed pause/resume, static reduced motion, paused scrolling, large-stage sizing, mobile connection shortcut, no horizontal overflow, and console completion/execution with a visible laptop prompt. Lint, TypeScript, all 74 existing tests and the adapter production build pass. The previous three-person artwork is superseded.
