export type ConnectionMode = "live" | "demo";

export interface ServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  relayKey?: string;
  rememberSecrets: boolean;
  createdAt: number;
}

export interface Player {
  userId: string;
  slot?: string;
  name: string;
  steamId: string;
  connected?: string;
  ping?: number;
  loss?: number;
  state?: string;
  rate?: number;
  address?: string;
  isBot: boolean;
}

export interface ServerSnapshot {
  hostname: string;
  map: string;
  address: string;
  version: string;
  os: string;
  secure: boolean | null;
  humans: number;
  bots: number;
  maxPlayers: number;
  players: Player[];
  raw: string;
  updatedAt: number;
}

export interface BanEntry {
  id: string;
  kind: "steam" | "ip";
  value: string;
  duration: string;
  raw: string;
}

export type MapCategory = "Defusal" | "Hostage" | "Wingman" | "Workshop" | "Custom";

export interface ServerMap {
  name: string;
  category: MapCategory;
  workshopId?: string;
}

export interface CommandDefinition {
  name: string;
  syntax: string;
  description: string;
  category: string;
  dangerous?: boolean;
}

export interface SyncedCommand {
  name: string;
  value: string;
  flags: string;
  description: string;
}

export type ConsoleEntryStatus = "success" | "error" | "pending";

export interface ConsoleEntry {
  id: string;
  command: string;
  response: string;
  status: ConsoleEntryStatus;
  timestamp: number;
  durationMs?: number;
}

export interface StoredState {
  version: 1;
  profiles: ServerProfile[];
  activeProfileId: string | null;
  favoriteMaps: string[];
  savedCommands: string[];
  consoleHistory: ConsoleEntry[];
  syncedCommands: SyncedCommand[];
  refreshSeconds: number;
}

export interface RconCommandResult {
  command: string;
  response: string;
  durationMs: number;
  truncated?: boolean;
}

export interface RconApiResponse {
  ok: boolean;
  results?: RconCommandResult[];
  error?: {
    code: string;
    message: string;
  };
}
