import { describe, expect, it } from "vitest";
import { DEFAULT_STORED_STATE, exportStoredState } from "../lib/storage";

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
