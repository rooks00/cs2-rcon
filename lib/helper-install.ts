export function helperLaunchCommand(origin: string, platform: "unix" | "windows", browserConnect = false): string {
  const url = new URL(origin);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use a website origin without a path or credentials.");
  }
  const site = url.origin;
  // Single-quoted literals in each shell, never executable interpolation.
  if (platform === "windows") {
    const literal = site.replaceAll("'", "''");
    return `& ([scriptblock]::Create((irm '${literal}/relay/install.ps1'))) -Site '${literal}'${browserConnect ? ' -BrowserConnect' : ''}`;
  }
  const literal = site.replaceAll("'", "'\\''");
  return `curl -fsSL '${literal}/relay/install.sh' | sh -s -- '${literal}'${browserConnect ? ' --browser-connect' : ''}`;
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

// Pairing stays in this tab's memory and is never persisted or sent to the host.
export const BROWSER_HELPER_ENDPOINT = "http://127.0.0.1:47391/api/rcon";
let browserToken: string | null = null;
export function hasBrowserHelper(): boolean { return browserToken !== null; }
export function disconnectBrowserHelper(): void { browserToken = null; knownHelper = null; }
export async function pairBrowserHelper(token: string, site: string): Promise<LocalHelperMetadata> {
  const value = token.trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Paste the 64-character pairing token from your helper terminal.");
  const response = await fetch(BROWSER_HELPER_ENDPOINT, {
    headers: { Authorization: `Bearer ${value}` }, credentials: "omit", cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(5000),
  });
  const settings = await response.json();
  if (!response.ok || settings.ok !== true || settings.transport !== "local-tcp" || helperWebsiteOrigin(settings.hostedSite) !== site) {
    throw new Error("Pairing failed. Start the helper for this website and check its token.");
  }
  const metadata = { site, version: typeof settings.helperVersion === "string" ? settings.helperVersion : "" };
  browserToken = value;
  rememberLocalHelper(metadata);
  return metadata;
}
export function fetchRcon(init: RequestInit = {}): Promise<Response> {
  if (!browserToken) return fetch("/api/rcon", init);
  const headers = new Headers(init.headers);
  headers.delete("x-relay-key");
  headers.set("Authorization", `Bearer ${browserToken}`);
  // Fail closed if the helper stops: never retry a local command through hosting.
  return fetch(BROWSER_HELPER_ENDPOINT, { ...init, headers, credentials: "omit", redirect: "error" });
}
