# Security

## Report a vulnerability

Do not put credentials or vulnerability details in public issues. Use [GitHub private vulnerability reporting](https://github.com/rooks00/cs2-rcon/security/advisories/new) when enabled. If that option is unavailable, open an issue asking the maintainer for a private contact channel without disclosing the vulnerability.

Include the affected version/commit, the security impact, relevant configuration, and a minimal description of the conditions involved. Redact passwords, tokens, private addresses, and personal data. Test only installations and game servers you own or have permission to assess.

Security fixes target the latest release and the default branch. Older versions have no promised backport support.

## Trust boundaries

- The hosted relay receives RCON credentials and runs commands on the selected server. Deploy it on infrastructure you trust.
- Source RCON is plaintext TCP. Use a VPN or trusted network and restrict game-server ingress.
- The helper grants the connected browser access to reachable RCON servers. Its pairing token is a credential; share it only with your own browser and stop the helper when finished.
- Remembered passwords are stored unencrypted in browser storage. Command history can contain secrets even when profile exports omit passwords.
- Built-in limits are per process; public deployments need external rate limits and egress restrictions. Origin checks do not authenticate non-browser clients.
- Helper downloads are unsigned. Checksums detect corruption; they do not protect against compromise of the server that provides both the archive and checksum.

See [the deployment guide](docs/deployment.md) and [helper boundaries](helper/README.md#session-and-network-boundaries) for configuration details. Never commit production `.env` files, passwords, or session tokens. Rotate any exposed credential even after removing it from Git history.
