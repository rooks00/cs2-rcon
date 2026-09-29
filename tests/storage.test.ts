import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STORED_STATE, exportStoredState, loadStoredState } from "../lib/storage";

describe("configuration exports", () => {
  it("excludes credentials and free-form server/command data", () => {
    const exported = JSON.parse(exportStoredState({
      ...DEFAULT_STORED_STATE,
      profiles: [{ id: "one", name: "Server", host: "cs2.example.com", port: 27015, password: "private-password", relayKey: "private-key", rememberSecrets: true, createdAt: 0 }],
      consoleHistory: [{ id: "one", command: "status", response: "private-output", status: "success", timestamp: 0 }],
      savedCommands: ["rcon_password private-command"],
      syncedCommands: [{ name: "rcon_password", value: "private-cvar", description: "", flags: "" }],
    }));
    expect(JSON.stringify(exported)).not.toContain("private-");
    expect(exported.profiles[0]).toMatchObject({ host: "cs2.example.com", rememberSecrets: false });
    expect(exported.consoleHistory).toEqual([]);
    expect(exported.savedCommands).toEqual([]);
    expect(exported.syncedCommands).toEqual([]);
  });
});

describe("stored state validation", () => {
  afterEach(() => vi.unstubAllGlobals());
  const load = (value: unknown) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify(value) } });
    return loadStoredState();
  };
  it("discards malformed nested values and unsafe polling intervals", () => {
    const state = load({ version: 1, profiles: [null, { id: "bad" }], activeProfileId: "bad", favoriteMaps: [null, "de_mirage"], savedCommands: [42, "status"], consoleHistory: [{ id: "broken" }], syncedCommands: [null], refreshSeconds: -1 });
    expect(state).toEqual({ ...DEFAULT_STORED_STATE, favoriteMaps: ["de_mirage"], savedCommands: ["status"] });
  });
  it("preserves valid profiles while stripping unremembered secrets", () => {
    const profile = { id: "one", name: "Server", host: "cs2.example.com", port: 27015, password: "secret", relayKey: "secret-key", rememberSecrets: false, createdAt: 0 };
    const state = load({ ...DEFAULT_STORED_STATE, profiles: [profile], activeProfileId: "one", refreshSeconds: 0 });
    expect(state.activeProfileId).toBe("one");
    expect(state.profiles[0].password).toBeUndefined();
    expect(state.profiles[0].relayKey).toBeUndefined();
    expect(state.refreshSeconds).toBe(0);
    expect(load({ ...DEFAULT_STORED_STATE, profiles: [{ ...profile, rememberSecrets: true }] }).profiles[0].password).toBe("secret");
  });
});
