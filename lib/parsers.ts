import { categorizeMap } from "@/lib/commands";
import type { BanEntry, ServerMap, ServerSnapshot, SyncedCommand } from "@/lib/types";

const EMPTY_SNAPSHOT: Omit<ServerSnapshot, "raw" | "updatedAt"> = {
  hostname: "Unknown server",
  map: "Unknown",
  address: "",
  version: "",
  os: "",
  secure: null,
  humans: 0,
  bots: 0,
  maxPlayers: 0,
  players: [],
};

function cleanValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+$/, "");
}

function readField(raw: string, names: string[]): string {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = raw.match(new RegExp(`^(?:${escaped})\\s*:\\s*(.+)$`, "im"));
  return cleanValue(match?.[1]);
}

function tokenizeStatusLine(line: string): string[] {
  return (line.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? []).map((token) =>
    token.startsWith('"') && token.endsWith('"')
      ? token.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : token,
  );
}

export function parseStatus(raw: string): ServerSnapshot {
  const normalized = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/, ""))
    .join("\n");
  const hostname = readField(normalized, ["hostname", "host name"]) || EMPTY_SNAPSHOT.hostname;
  const mapField = readField(normalized, ["map"]);
  const spawnMap = normalized.match(/loaded spawngroup\(\s*1\s*\).*?\[\s*1\s*:\s*([^|\]]+)/i)?.[1]?.trim() ?? "";
  const address = readField(normalized, ["udp/ip", "tcp/ip", "ip"]);
  const version = readField(normalized, ["version"]);
  const os = readField(normalized, ["os", "os/type"]).split(/\s+/)[0];
  const secure = /\bsecure\b/i.test(version) ? true : /\binsecure\b/i.test(version) ? false : null;

  let humans = 0;
  let bots = 0;
  let maxPlayers = 0;
  const detailedCount = normalized.match(/players\s*:\s*(\d+)\s+humans?\s*,\s*(\d+)\s+bots?.*?\((\d+)\s+max\)/i);
  const simpleCount = normalized.match(/players\s*:\s*(\d+)(?:\s+active|\s+humans?)?.*?\((\d+)\s+max\)/i);
  if (detailedCount) {
    humans = Number(detailedCount[1]);
    bots = Number(detailedCount[2]);
    maxPlayers = Number(detailedCount[3]);
  } else if (simpleCount) {
    humans = Number(simpleCount[1]);
    maxPlayers = Number(simpleCount[2]);
  }

  const lines = normalized.split("\n");
  const headerIndex = lines.findIndex((line) => /userid\s+name\s+(?:uniqueid|steamid)/i.test(line));
  const modernHeaderIndex = lines.findIndex((line) => /^\s*id\s+time\s+ping\s+loss\s+state\s+rate(?:\s+adr)?\s+name\s*$/i.test(line));
  const players: ServerSnapshot["players"] = [];

  if (headerIndex >= 0) {
    for (const originalLine of lines.slice(headerIndex + 1)) {
      const line = originalLine.trim().replace(/^#\s*/, "");
      if (!line || /^[-=]+$/.test(line) || /^\d+\s+users?\b/i.test(line)) continue;

      const rawTokens = line.match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
      const tokens = tokenizeStatusLine(line);
      const quotedNameIndex = rawTokens.findIndex((token, index) => index > 0 && token.startsWith('"'));
      const nameIndex = quotedNameIndex >= 1 ? quotedNameIndex : tokens.findIndex((token, index) => index > 0 && !/^\d+$/.test(token));
      if (nameIndex < 1) continue;

      const steamIndex = tokens.findIndex(
        (token, index) => index > nameIndex && (/^STEAM_/i.test(token) || /^\[U:\d+:\d+\]$/i.test(token) || /^7656119\d{10}$/.test(token) || token === "BOT"),
      );
      if (steamIndex < 0) continue;

      const userId = tokens[0];
      const slot = nameIndex > 1 ? tokens[nameIndex - 1] : undefined;
      const name = tokens.slice(nameIndex, steamIndex).join(" ");
      const steamId = tokens[steamIndex];
      const tail = tokens.slice(steamIndex + 1);
      const isBot = steamId === "BOT";
      const connected = tail.find((token) => /^\d{1,3}:\d{2}(?::\d{2})?$/.test(token));
      const connectedIndex = connected ? tail.indexOf(connected) : -1;
      const numericTail = tail.slice(connectedIndex + 1).filter((token) => /^\d+$/.test(token)).map(Number);
      const state = tail.find((token) => /^(active|spawning|connecting|challenging|zombie)$/i.test(token));
      const addressToken = [...tail].reverse().find((token) => /(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|\[[0-9a-f:]+\](?::\d+)?/i.test(token));

      players.push({
        userId,
        slot,
        name,
        steamId,
        connected,
        ping: isBot ? undefined : numericTail[0],
        loss: isBot ? undefined : numericTail[1],
        state: state ?? (isBot ? "active" : undefined),
        rate: isBot ? undefined : numericTail[2],
        address: addressToken,
        isBot,
      });
    }
  } else if (modernHeaderIndex >= 0) {
    for (const originalLine of lines.slice(modernHeaderIndex + 1)) {
      const line = originalLine.trim();
      if (!line || line === "#end" || /^[-=]+$/.test(line)) break;
      const match = line.match(/^(\d+)\s+(\S+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(?:(\S+)\s+)?['"]([^'"]*)['"]\s*$/);
      if (!match || !match[8]) continue;
      players.push({
        userId: match[1],
        name: match[8],
        steamId: "",
        connected: match[2] === "BOT" ? undefined : match[2],
        ping: Number(match[3]),
        loss: Number(match[4]),
        state: match[5],
        rate: Number(match[6]),
        address: match[7],
        isBot: match[2] === "BOT",
      });
    }
  }

  if (!detailedCount && players.length) {
    humans = players.filter((player) => !player.isBot).length;
    bots = players.filter((player) => player.isBot).length;
  }

  return {
    ...EMPTY_SNAPSHOT,
    hostname,
    map: mapField.split(/\s+/)[0] || spawnMap || EMPTY_SNAPSHOT.map,
    address,
    version,
    os,
    secure,
    humans,
    bots,
    maxPlayers,
    players,
    raw,
    updatedAt: Date.now(),
  };
}

export function enrichStatusWithJson(snapshot: ServerSnapshot, rawJson: string): ServerSnapshot {
  const start = rawJson.indexOf("{");
  const end = rawJson.lastIndexOf("}");
  if (start < 0 || end <= start) return snapshot;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson.slice(start, end + 1));
  } catch {
    return snapshot;
  }
  if (!parsed || typeof parsed !== "object") return snapshot;
  const server = (parsed as { server?: unknown }).server;
  if (!server || typeof server !== "object") return snapshot;

  type JsonClient = { steamid64?: unknown; steamid?: unknown; bot?: unknown; name?: unknown };
  const data = server as {
    map?: unknown;
    clients_human?: unknown;
    clients_bot?: unknown;
    clients?: unknown;
  };
  const clients = Array.isArray(data.clients) ? data.clients.filter((client): client is JsonClient => Boolean(client) && typeof client === "object") : [];
  const used = new Set<number>();
  const isValidSteamId = (value: unknown): value is string =>
    typeof value === "string" && value !== "0" && value !== "[I:0:0]" && /^(?:STEAM_|\[U:|7656119\d{10}$)/i.test(value);

  const players = snapshot.players.map((player, playerIndex) => {
    let clientIndex = clients.findIndex((client, index) => !used.has(index) && typeof client.name === "string" && client.name === player.name);
    if (clientIndex < 0 && clients.length === snapshot.players.length && clients[playerIndex]) clientIndex = playerIndex;
    if (clientIndex < 0) return player;
    used.add(clientIndex);
    const client = clients[clientIndex];
    const steamId = isValidSteamId(client.steamid) ? client.steamid : isValidSteamId(client.steamid64) ? client.steamid64 : player.steamId;
    return {
      ...player,
      name: typeof client.name === "string" && client.name ? client.name : player.name,
      steamId,
      isBot: typeof client.bot === "boolean" ? client.bot : player.isBot,
    };
  });

  return {
    ...snapshot,
    map: typeof data.map === "string" && data.map ? data.map : snapshot.map,
    humans: typeof data.clients_human === "number" ? data.clients_human : snapshot.humans,
    bots: typeof data.clients_bot === "number" ? data.clients_bot : snapshot.bots,
    players,
  };
}

export function parseBanList(raw: string, kind: BanEntry["kind"]): BanEntry[] {
  const steamPattern = /(?:STEAM_[0-5]:[01]:\d+|\[U:\d+:\d+\]|7656119\d{10})/gi;
  const ipPattern = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/g;
  const seen = new Set<string>();
  const entries: BanEntry[] = [];

  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const matches = line.match(kind === "steam" ? steamPattern : ipPattern) ?? [];
    for (const value of matches) {
      const normalized = kind === "steam" ? value.toUpperCase() : value;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const durationMatch = line.match(/(permanent|\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|hours?|days?))/i);
      entries.push({
        id: `${kind}-${normalized}`,
        kind,
        value: normalized,
        duration: durationMatch?.[1] ?? (/(?:^|\s)0(?:\.0+)?(?:\s|$)/.test(line) ? "Permanent" : "Server ban"),
        raw: line.trim(),
      });
    }
  }

  return entries;
}

export function parseMaps(raw: string): ServerMap[] {
  const names = new Set<string>();
  const normalized = raw.replace(/\\/g, "/").replace(/\r/g, "");

  for (const line of normalized.split("\n")) {
    for (const match of line.matchAll(/(?:^|[^a-z0-9_])maps\/(?:workshop\/\d+\/)?([a-z0-9][a-z0-9_.-]*)\.vpk\b/gi)) {
      names.add(match[1].toLowerCase());
    }
    const bare = line.trim().match(/^(?:\d+[.):]?\s*)?((?:de|cs|ar|gd|aim|awp|surf|kz|ze|fy)_[a-z0-9_.-]+)(?:\.vpk)?(?:\s|$)/i);
    if (bare) names.add(bare[1].toLowerCase().replace(/\.vpk$/, ""));
  }

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, category: categorizeMap(name) }));
}

export function parseCvarList(raw: string): SyncedCommand[] {
  const commands = new Map<string, SyncedCommand>();

  for (const originalLine of raw.replace(/\r/g, "").split("\n")) {
    const line = originalLine.trim();
    if (!line || /^[-=]{3,}/.test(line) || /total convars/i.test(line)) continue;

    let name = "";
    let value = "";
    let flags = "";
    let description = "";
    const colonMatch = line.match(/^"?([a-z_][\w.]*)"?\s*:\s*(.*?)\s*:\s*(.*?)\s*:\s*(.*)$/i);
    const equalsMatch = line.match(/^"([a-z_][\w.]*)"\s*=\s*"?([^"\s]*)"?\s*(.*?)\s+-\s+(.*)$/i);

    if (colonMatch) {
      [, name, value, flags, description] = colonMatch;
    } else if (equalsMatch) {
      [, name, value, flags, description] = equalsMatch;
    } else {
      const commandMatch = line.match(/^([a-z_][\w.]*)\s+-\s+(.+)$/i);
      if (!commandMatch) continue;
      [, name, description] = commandMatch;
    }

    commands.set(name.toLowerCase(), {
      name,
      value: value.trim(),
      flags: flags.trim().replace(/^,\s*/, ""),
      description: description.trim(),
    });
  }

  return [...commands.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseIntegerCvar(raw: string, name: string): number | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedPatterns = [
    new RegExp(`"${escapedName}"\\s*=\\s*"?(-?\\d+)`, "i"),
    new RegExp(`\\b${escapedName}\\b\\s*(?::|=)\\s*"?(-?\\d+)`, "i"),
  ];
  for (const pattern of namedPatterns) {
    const match = raw.match(pattern);
    if (match) return Number(match[1]);
  }

  const plain = raw.trim().match(/^"?(-?\d+)"?$/);
  return plain ? Number(plain[1]) : null;
}
