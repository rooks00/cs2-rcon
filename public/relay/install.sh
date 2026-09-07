#!/bin/sh
# Relay's temporary native helper. No sudo, global installation or background service.
set -eu
relay_site=${1:-}
if [ "$#" -gt 0 ]; then shift; fi
relay_site=${relay_site%/}
case "$relay_site" in
  https://*|http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*) ;;
  *) printf '%s\n' 'Pass your HTTPS Relay website as the first argument.' >&2; exit 1 ;;
esac
relay_authority=${relay_site#*://}
case "$relay_authority" in
  ''|*[!a-zA-Z0-9.\[\]:_-]*) printf '%s\n' 'Use a website origin without a path, query or credentials.' >&2; exit 1 ;;
esac
case "$(uname -s)" in Darwin) relay_os=darwin ;; Linux) relay_os=linux ;; *) printf '%s\n' 'Use the PowerShell launcher on Windows.' >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) relay_arch=amd64 ;; arm64|aarch64) relay_arch=arm64 ;; *) printf '%s\n' 'This helper supports 64-bit Intel/AMD and ARM computers.' >&2; exit 1 ;; esac
relay_dir=$(mktemp -d "${TMPDIR:-/tmp}/relay-helper.XXXXXX")
trap 'rm -rf "$relay_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
relay_name="relay-helper-$relay_os-$relay_arch"
relay_base="$relay_site/relay/v0.2.2/$relay_name.gz"
printf '%s\n' 'Downloading Relay Helper. No installation or administrator privileges required.'
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 180 "$relay_base" -o "$relay_dir/helper.gz"
curl --fail --silent --show-error --location --connect-timeout 15 --max-time 30 "$relay_base.sha256" -o "$relay_dir/checksum"
relay_expected=$(tr -d '\r\n' < "$relay_dir/checksum")
if command -v sha256sum >/dev/null 2>&1; then
  relay_actual=$(sha256sum "$relay_dir/helper.gz" | cut -d ' ' -f 1)
elif command -v shasum >/dev/null 2>&1; then
  relay_actual=$(shasum -a 256 "$relay_dir/helper.gz" | cut -d ' ' -f 1)
else
  printf '%s\n' 'A SHA-256 tool (sha256sum or shasum) is required.' >&2; exit 1
fi
if [ ${#relay_expected} -ne 64 ] || [ "$relay_expected" != "$relay_actual" ]; then
  printf '%s\n' 'Download checksum did not match. Nothing was executed.' >&2; exit 1
fi
gzip -dc "$relay_dir/helper.gz" > "$relay_dir/$relay_name"
chmod 700 "$relay_dir/$relay_name"
"$relay_dir/$relay_name" --site "$relay_site" "$@"
