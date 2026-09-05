import type { StoredState } from "@/lib/types";

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

export function loadStoredState(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STORED_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORED_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1) return DEFAULT_STORED_STATE;

    return {
      ...DEFAULT_STORED_STATE,
      ...parsed,
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      favoriteMaps: Array.isArray(parsed.favoriteMaps) ? parsed.favoriteMaps : [],
      savedCommands: Array.isArray(parsed.savedCommands) ? parsed.savedCommands : [],
      consoleHistory: Array.isArray(parsed.consoleHistory) ? parsed.consoleHistory.slice(0, 100) : [],
      syncedCommands: Array.isArray(parsed.syncedCommands) ? parsed.syncedCommands.slice(0, 12000) : [],
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
