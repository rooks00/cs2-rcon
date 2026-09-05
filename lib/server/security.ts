import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export class TargetValidationError extends Error {
  constructor(
    public readonly code: "INVALID_HOST" | "HOST_BLOCKED" | "HOST_NOT_ALLOWED" | "DNS_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "TargetValidationError";
  }
}

export function relaySecretMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    // Next may rewrite request.url to the internal listening address. Browsers
    // cannot forge Host, so preserve its external authority (including the port).
    // Do not accept x-forwarded-host; TLS proxies can set an explicit public origin.
    const url = new URL(request.url);
    const authority = request.headers.get("host") || url.host;
    if (/[\s/@?#\\,]/.test(authority)) return false;
    const expectedOrigin = process.env.RCON_PUBLIC_ORIGIN || `${url.protocol}//${authority}`;
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export async function resolvePublicRconHost(hostInput: string): Promise<{ address: string; family: 4 | 6; hostname: string }> {
  const unwrapped = hostInput.trim().replace(/^\[|\]$/g, "");
  if (!unwrapped || unwrapped.length > 253 || /[\s/@?#\\]/.test(unwrapped)) {
    throw new TargetValidationError("INVALID_HOST", "Enter a hostname or IP address without a URL scheme or path.");
  }

  const hostname = isIP(unwrapped) ? unwrapped : domainToASCII(unwrapped.toLowerCase());
  if (!hostname || (!isIP(hostname) && !isValidHostname(hostname))) {
    throw new TargetValidationError("INVALID_HOST", "The RCON hostname is not valid.");
  }
  enforceAllowlist(hostname);

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new TargetValidationError("DNS_FAILED", "The RCON hostname could not be resolved.");
  }
  if (!addresses.length) throw new TargetValidationError("DNS_FAILED", "The RCON hostname did not resolve to an address.");

  const allowPrivateInDevelopment = process.env.NODE_ENV !== "production" && process.env.RCON_ALLOW_PRIVATE_DEV !== "false";
  const explicitlyAllowed = process.env.RCON_ALLOW_PRIVATE === "true" &&
    process.env.RCON_ALLOWED_HOSTS?.split(",").some((item) => item.trim().toLowerCase() === hostname);
  if (addresses.some(({ address, family }) => !isPublicAddress(address, family) &&
    !((allowPrivateInDevelopment || explicitlyAllowed) && isLocalAddress(address, family)))) {
    throw new TargetValidationError("HOST_BLOCKED", "This address is not reachable through a public connection. For LAN servers, run Relay on your network and explicitly allow the server in its configuration.");
  }

  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6, hostname };
}

function enforceAllowlist(hostname: string): void {
  const configured = process.env.RCON_ALLOWED_HOSTS?.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!configured?.length) return;
  const allowed = configured.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return hostname === entry;
  });
  if (!allowed) throw new TargetValidationError("HOST_NOT_ALLOWED", "This host is not present in RCON_ALLOWED_HOSTS.");
}

function isValidHostname(hostname: string): boolean {
  return hostname.length <= 253 && hostname.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

export function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const groups = expandIpv6(address);
  if (!groups) return false;

  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isMapped) return isPublicIpv4(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`);

  // Public IPv6 global unicast is currently allocated from 2000::/3.
  if (groups[0] < 0x2000 || groups[0] > 0x3fff) return false;
  // Reject transition/special-use ranges (including Teredo, 6to4, ORCHID,
  // benchmarking and documentation), which can tunnel non-public IPv4.
  if (groups[0] === 0x2001 && (groups[1] <= 0x01ff || groups[1] === 0x0db8)) return false;
  if (groups[0] === 0x2002 || (groups[0] === 0x3fff && groups[1] <= 0x0fff)) return false;
  return true;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isLocalAddress(address: string, family: number): boolean {
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const groups = expandIpv6(address);
  if (!groups) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isLocalAddress(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`, 4);
  }
  return (groups[0] & 0xfe00) === 0xfc00 || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1);
}

function expandIpv6(address: string): number[] | null {
  let input = address.toLowerCase().split("%")[0];
  const ipv4Match = input.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const octets = ipv4Match[1].split(".").map(Number);
    if (octets.some((octet) => octet < 0 || octet > 255)) return null;
    input = `${input.slice(0, -ipv4Match[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const raw = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (raw.length !== 8 || raw.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return raw.map((group) => Number.parseInt(group, 16));
}
