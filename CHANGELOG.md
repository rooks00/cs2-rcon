# Changelog

Versions follow [Semantic Versioning](https://semver.org/). While below 1.0,
minor releases may include breaking changes; patches contain compatible fixes.

## Unreleased

- Hardened connection switching, session cancellation, stored settings, and Steam account parsing.
- Tightened JSON validation, bounded upstream responses, and corrected RCON response completion handling.
- Helper 0.2.3 includes HTTP validation fixes, safer redirects, and atomic release builds.
- Removed unused particle data, reducing its size by 30% without changing the rendered artwork.

- Node 26 development/container runtime and Node 26 types, with Node 24 compatibility for Vercel Functions.

- Public project documentation, MIT license, and security guidance.
- Verified, tag-triggered Docker Hub releases.
- Same-tab device pairing with native helper 0.2.0 and a local workspace fallback.
- Bounded Workshop requests and safer configuration exports.
- Helper 0.2.2 recognizes Windows reset and aborted-connection statuses after map-change commands.

## 0.1.0

- Initial CS2 RCON web console and optional native connection helper.
