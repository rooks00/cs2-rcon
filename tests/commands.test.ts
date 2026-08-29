import { describe, expect, it } from "vitest";
import { GAME_MODE_PRESETS, getCommandCompletions, getMapChangeCommand } from "../lib/commands";

describe("GAME_MODE_PRESETS", () => {
  it("contains each current gamemodes.txt type/mode pair once", () => {
    const pairs = GAME_MODE_PRESETS.map((preset) => `${preset.type}/${preset.mode}`);
    expect(new Set(pairs).size).toBe(GAME_MODE_PRESETS.length);
    expect([...new Set(GAME_MODE_PRESETS.map((preset) => preset.type))]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps key CS2 mode values aligned with Valve's current definitions", () => {
    const valueFor = (id: string) => {
      const preset = GAME_MODE_PRESETS.find((item) => item.id === id);
      return preset ? [preset.type, preset.mode] : null;
    };
    expect(valueFor("casual")).toEqual([0, 0]);
    expect(valueFor("competitive")).toEqual([0, 1]);
    expect(valueFor("wingman")).toEqual([0, 2]);
    expect(valueFor("retakes")).toEqual([0, 5]);
    expect(valueFor("arms-race")).toEqual([1, 0]);
    expect(valueFor("deathmatch")).toEqual([1, 2]);
    expect(valueFor("custom")).toEqual([3, 0]);
    expect(valueFor("coop-strike")).toEqual([4, 1]);
  });
});

describe("getMapChangeCommand", () => {
  it("uses the Workshop ID when one was discovered during map sync", () => {
    expect(getMapChangeCommand({ name: "aim_botz", category: "Workshop", workshopId: "3070244462" })).toBe("host_workshop_map 3070244462");
  });

  it("uses changelevel only for ordinary installed maps", () => {
    expect(getMapChangeCommand({ name: "de_mirage", category: "Defusal" })).toBe("changelevel de_mirage");
  });

  it("uses the dedicated collection command when CS2 exposes a Workshop name but no ID", () => {
    expect(getMapChangeCommand({ name: "surf_utopia", category: "Workshop" })).toBe("ds_workshop_changelevel surf_utopia");
  });
});

describe("getCommandCompletions", () => {
  const commands = [{ name: "status" }, { name: "stats" }, { name: "say" }, { name: "sv_cheats" }];

  it("matches the first command token case-insensitively", () => {
    expect(getCommandCompletions(commands, "ST").map((command) => command.name)).toEqual(["stats", "status"]);
  });

  it("does not offer command-name completion after arguments begin", () => {
    expect(getCommandCompletions(commands, "status ")).toEqual([]);
    expect(getCommandCompletions(commands, "")).toEqual([]);
  });
});
