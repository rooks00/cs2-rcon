export interface ConnectionDetails {
  name: string;
  host: string;
  port: number;
  password: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseServerAddress(raw: string, defaultPort = 27015): { host: string; port: number } {
  let host = raw.trim();
  let port = defaultPort;
  const bracketed = host.match(/^\[([^\]]+)\](?::(\d+))?$/);
  const pair = host.match(/^([^:]+):(\d+)$/);
  if (bracketed) { host = bracketed[1]; if (bracketed[2]) port = Number(bracketed[2]); }
  else if (pair) { host = pair[1]; port = Number(pair[2]); }
  if (!host || host.length > 253 || /[\s/@?#\\\[\]]/.test(host) || host.includes("://")) {
    throw new Error("Enter a hostname or IP address, without a URL or path.");
  }
  if (!host.includes(":") && !host.split(".").every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))) {
    throw new Error("The server address is not a valid hostname or IP.");
  }
  if (host.includes(":")) {
    try { new URL(`http://[${host}]/`); } catch { throw new Error("Use a valid IPv6 address, with brackets when including a port."); }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be a whole number between 1 and 65535.");
  return { host, port };
}

/** Import common RCON config shapes without retaining unrecognized fields or secrets. */
export function parseConnectionJson(text: string): ConnectionDetails[] {
  if (text.length > 100_000) throw new Error("This JSON is too large. Paste up to 50 server profiles.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON. Use double quotes and remove trailing commas."); }
  const root = record(parsed);
  const candidates = Array.isArray(parsed) ? parsed : root && Array.isArray(root.servers ?? root.profiles)
    ? (root.servers ?? root.profiles) as unknown[] : [parsed];
  if (!candidates.length || candidates.length > 50) throw new Error("Paste one server or an array of 1–50 servers.");
  return candidates.map((candidate, index) => {
    const outer = record(candidate);
    const item = record(outer?.rcon) ?? record(outer?.server) ?? outer;
    if (!item) throw new Error(`Server ${index + 1} must be a JSON object.`);
    const rawHost = item.host ?? item.hostname ?? item.address ?? item.ip;
    if (typeof rawHost !== "string") throw new Error(`Server ${index + 1} needs a host, address, or ip field.`);
    const rawPort = item.port ?? item.rconPort ?? item.rcon_port ?? 27015;
    if ((typeof rawPort !== "number" && typeof rawPort !== "string") || !String(rawPort).trim()) throw new Error("Port must be a number.");
    const address = parseServerAddress(rawHost, Number(rawPort));
    const password = item.password ?? item.rconPassword ?? item.rcon_password ?? "";
    if (typeof password !== "string" || password.includes("\0") || new TextEncoder().encode(password).length > 1000) {
      throw new Error("RCON password must be text containing at most 1000 bytes.");
    }
    const name = item.name ?? outer?.name ?? "";
    if (typeof name !== "string") throw new Error("Profile name must be text.");
    return { ...address, name: name.trim().slice(0, 60), password };
  });
}

export const EXAMPLE_CONNECTION_JSON = JSON.stringify({ name: "My CS2 server", host: "cs2.example.com", port: 27015, password: "your-rcon-password" }, null, 2);
