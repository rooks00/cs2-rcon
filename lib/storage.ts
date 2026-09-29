import type { ConsoleEntry, ServerProfile, StoredState, SyncedCommand } from "@/lib/types";

export const STORAGE_KEY = "relay.cs2.state.v1";

export const DEFAULT_STORED_STATE: StoredState = {
  version: 1,
  profiles: [],
  activeProfileId: null,
  favoriteMaps: [],
  savedCommands: ["status", "maps *", "listid", "listip"],
  consoleHistory: [],
  syncedCommands: [],
  refreshSeconds: 15,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string { return typeof value === "string"; }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function validItems<T>(value: unknown, valid: (item: unknown) => item is T, limit: number): T[] {
  return Array.isArray(value) ? value.filter(valid).slice(0, limit) : [];
}
function isProfile(value: unknown): value is ServerProfile {
  return isRecord(value) && isText(value.id) && value.id !== "demo" && !!value.id && isText(value.name)
    && isText(value.host) && !!value.host && isFiniteNumber(value.port) && Number.isInteger(value.port)
    && value.port >= 1 && value.port <= 65535 && typeof value.rememberSecrets === "boolean"
    && isFiniteNumber(value.createdAt) && (value.password === undefined || isText(value.password))
    && (value.relayKey === undefined || isText(value.relayKey));
}
function isConsoleEntry(value: unknown): value is ConsoleEntry {
  return isRecord(value) && isText(value.id) && isText(value.command) && isText(value.response)
    && isText(value.status) && ["pending", "success", "error"].includes(value.status) && isFiniteNumber(value.timestamp)
    && Math.abs(value.timestamp) <= 8.64e15 && (value.durationMs === undefined || isFiniteNumber(value.durationMs));
}
function isSyncedCommand(value: unknown): value is SyncedCommand {
  return isRecord(value) && [value.name, value.value, value.flags, value.description].every(isText);
}

export function loadStoredState(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STORED_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(parsed) || parsed.version !== 1) return DEFAULT_STORED_STATE;
    const profiles = validItems(parsed.profiles, isProfile, 50).map((profile) => ({
      id: profile.id, name: profile.name, host: profile.host, port: profile.port,
      rememberSecrets: profile.rememberSecrets, createdAt: profile.createdAt,
      ...(profile.rememberSecrets ? { password: profile.password, relayKey: profile.relayKey } : {}),
    }));
    return {
      version: 1,
      profiles,
      activeProfileId: profiles.some((profile) => profile.id === parsed.activeProfileId) ? parsed.activeProfileId as string : null,
      favoriteMaps: validItems(parsed.favoriteMaps, isText, 1000),
      savedCommands: validItems(parsed.savedCommands, isText, 1000),
      consoleHistory: validItems(parsed.consoleHistory, isConsoleEntry, 100),
      syncedCommands: validItems(parsed.syncedCommands, isSyncedCommand, 12000),
      refreshSeconds: [0, 10, 15, 30, 60].includes(parsed.refreshSeconds as number) ? parsed.refreshSeconds as number : 15,
    };
  } catch {
    return DEFAULT_STORED_STATE;
  }
}

export function saveStoredState(state: StoredState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportStoredState(state: StoredState): string {
  const safeState: StoredState = {
    ...state,
    // Commands and server output can contain passwords, tokens and player IPs.
    consoleHistory: [],
    syncedCommands: [],
    savedCommands: [],
    profiles: state.profiles.map((profile) => {
      const safeProfile = { ...profile };
      delete safeProfile.password;
      delete safeProfile.relayKey;
      safeProfile.rememberSecrets = false;
      return safeProfile;
    }),
  };
  return JSON.stringify(safeState, null, 2);
}
