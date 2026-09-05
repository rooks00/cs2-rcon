export function helperLaunchCommand(origin: string, platform: "unix" | "windows"): string {
  const url = new URL(origin);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use a website origin without a path or credentials.");
  }
  const site = url.origin;
  // Single-quoted literals in each shell, never executable interpolation.
  if (platform === "windows") {
    const literal = site.replaceAll("'", "''");
    return `& ([scriptblock]::Create((irm '${literal}/relay/install.ps1'))) -Site '${literal}'`;
  }
  const literal = site.replaceAll("'", "'\\''");
  return `curl -fsSL '${literal}/relay/install.sh' | sh -s -- '${literal}'`;
}

export function helperWebsiteOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

// Non-secret transport metadata survives form remounts while this page is open,
// so a stopped helper still offers the correct hosted fallback destination.
export type LocalHelperMetadata = { site: string; version: string };
let knownHelper: LocalHelperMetadata | null = null;
export function getKnownLocalHelper(): LocalHelperMetadata | null { return knownHelper; }
export function rememberLocalHelper(value: LocalHelperMetadata): void { knownHelper = value; }
