import { describe, expect, it } from "vitest";
import { enrichStatusWithJson, mergeServerMaps, parseBanList, parseCvarList, parseIntegerCvar, parseMaps, parseStatus, parseWorkshopMapList } from "../lib/parsers";

const STATUS = `hostname: RELAY // TEST
version : 1.41.3.2/14132 10581 secure
udp/ip  : 203.0.113.42:27015
os      : Linux
map     : de_mirage
players : 2 humans, 1 bots (12 max) (not hibernating)
# userid name uniqueid connected ping loss state rate adr
# 2 1 "Player One" STEAM_1:1:12345 11:35 14 0 active 786432 198.51.100.1:27005
# 7 "GOTV" BOT active 32
# 10 3 "Mika" [U:1:99881] 07:11 47 1 active 786432 198.51.100.2:27005`;

describe("parseStatus", () => {
  it("deduplicates repeated user IDs while retaining namesakes and separate bots", () => {
    const row = '# 2 "Same Name" STEAM_1:1:12345 11:35 14 0 active 786432';
    const status = parseStatus(`# userid name uniqueid connected ping loss state rate adr\n${row}\n${row}\n# 3 "Same Name" STEAM_1:1:99999 11:35 14 0 active 786432\n# 4 "Bot" BOT active 32\n# 5 "Bot" BOT active 32\n#end\n# 6 "Not in roster" BOT active 32`);
    expect(status.players.map((player) => player.userId)).toEqual(["2", "3", "4", "5"]);
    expect(status.humans).toBe(2);
    expect(status.bots).toBe(2);
  });

  it("supports apostrophes in modern names and repeated rows", () => {
    const row = "2 1:24:03 18 0 active 196608 'O'Brien'";
    const status = parseStatus(`id time ping loss state rate name\n${row}\n${row}\n#end`);
    expect(status.players).toHaveLength(1);
    expect(status.players[0].name).toBe("O'Brien");
  });

  it("does not assign Steam IDs by array position or ambiguous names", () => {
    const status = parseStatus("id time ping loss state rate name\n2 1:00 18 0 active 100 'Renamed'\n3 1:00 18 0 active 100 'Twin'\n4 1:00 18 0 active 100 'Twin'\n#end");
    const enriched = enrichStatusWithJson(status, JSON.stringify({ server: { clients: [
      { name: "Old name", steamid: "[U:1:111]" },
      { name: "Twin", steamid: "[U:1:222]" },
      { name: "Twin", steamid: "[U:1:333]" },
    ] } }));
    expect(enriched.players.map((player) => player.steamId)).toEqual(["", "", ""]);
  });
  it("extracts server metadata and both human and bot rows", () => {
    const status = parseStatus(STATUS);
    expect(status.hostname).toBe("RELAY // TEST");
    expect(status.map).toBe("de_mirage");
    expect(status.humans).toBe(2);
    expect(status.bots).toBe(1);
    expect(status.maxPlayers).toBe(12);
    expect(status.secure).toBe(true);
    expect(status.players).toHaveLength(3);
    expect(status.players[0]).toMatchObject({ userId: "2", name: "Player One", steamId: "STEAM_1:1:12345", ping: 14, loss: 0 });
    expect(status.players[1]).toMatchObject({ userId: "7", name: "GOTV", steamId: "BOT", isBot: true });
    expect(status.players[2]).toMatchObject({ name: "Mika", steamId: "[U:1:99881]", ping: 47, loss: 1 });
  });

  it("supports current Source 2 status rows and derives the map from spawngroups", () => {
    const modern = parseStatus(`[Client] hostname : Modern server
[Client] version  : 1.41.7.5/14175 10847 secure public
[Client] os/type  : Linux dedicated
[Client] players  : 1 humans, 1 bots (10 max) (not hibernating)
[Client] loaded spawngroup(  1)  : SV:  [1: de_train | main lump | mapload]
[Client] ---------players--------
[Client]   id     time ping loss      state   rate adr name
[Client]    2  1:24:03   18    0     active 196608 192.0.2.5:57743 'Numeric 123'
[Client]    3      BOT    0    0     active      0 'Gabe'
[Client] #end`);
    expect(modern.map).toBe("de_train");
    expect(modern.os).toBe("Linux");
    expect(modern.players).toHaveLength(2);
    expect(modern.players[0]).toMatchObject({ userId: "2", name: "Numeric 123", ping: 18, steamId: "" });
    expect(modern.players[1]).toMatchObject({ userId: "3", name: "Gabe", isBot: true });

    const enriched = enrichStatusWithJson(modern, JSON.stringify({ server: { map: "de_train", clients_human: 1, clients_bot: 1, clients: [
      { steamid64: "76561198012345678", steamid: "[U:1:26039975]", bot: false, name: "Numeric 123" },
      { steamid64: "0", steamid: "[I:0:0]", bot: true, name: "Gabe" },
    ] } }));
    expect(enriched.players[0].steamId).toBe("[U:1:26039975]");
    expect(enriched.players[1].steamId).toBe("");
  });
});

describe("parseBanList", () => {
  it("supports Steam2, Steam3, Steam64, and IP filters without duplicates", () => {
    const steam = parseBanList(`1 STEAM_1:0:123 permanent\n2 [U:1:99881] 45 minutes\n3 76561198012345678\nSTEAM_1:0:123`, "steam");
    const ips = parseBanList(`1 192.0.2.4 permanent\n2 198.51.100.8 15 minutes`, "ip");
    expect(steam.map((entry) => entry.value)).toEqual(["STEAM_1:0:123", "[U:1:99881]", "76561198012345678"]);
    expect(steam[1].duration).toBe("45 minutes");
    expect(ips).toHaveLength(2);
  });
});

describe("parseMaps", () => {
  it("normalizes archive indexes and ignores chunks and legacy BSP files", () => {
    expect(parseMaps("[Console] de_mirage\nmaps/workshop/123/de_cache_dir.vpk\nmaps/workshop/123/de_cache_000.vpk\nde_old.bsp")).toEqual([
      { name: "de_cache", category: "Workshop", workshopId: "123" },
      { name: "de_mirage", category: "Defusal" },
    ]);
  });
  it("extracts VPK paths and bare map rows", () => {
    const maps = parseMaps(`PENDING: (fs)maps/de_mirage.vpk\n/maps/workshop/123/aim_redline.vpk\n3. cs_office\nnoise`);
    expect(maps.map((map) => map.name)).toEqual(["aim_redline", "cs_office", "de_mirage"]);
    expect(maps.find((map) => map.name === "aim_redline")).toMatchObject({ category: "Workshop", workshopId: "123" });
    expect(maps.find((map) => map.name === "cs_office")?.category).toBe("Hostage");
  });

  it("recognizes nested and Windows-style Workshop paths without losing the published file ID", () => {
    const maps = parseMaps(`PENDING: (fs)maps\\workshop\\3070244462\\aim_botz.vpk\n(fs) workshop/3251335864/maps/surf_utopia.vpk`);
    expect(maps).toEqual([
      { name: "aim_botz", category: "Workshop", workshopId: "3070244462" },
      { name: "surf_utopia", category: "Workshop", workshopId: "3251335864" },
    ]);
  });
});

describe("Workshop map inventory", () => {
  it("strips extensions and preserves different versions with the same filename", () => {
    expect(parseWorkshopMapList("maps/workshop/111/de_lake.vpk\nmaps/workshop/222/de_lake.vpk\nold_map.bsp")).toEqual([
      { name: "de_lake", category: "Workshop", workshopId: "111" },
      { name: "de_lake", category: "Workshop", workshopId: "222" },
    ]);
  });

  it("never guesses which filename belongs to a numeric Workshop archive", () => {
    const merged = mergeServerMaps([{ name: "123", workshopId: "123", category: "Workshop" }], [{ name: "de_lake", category: "Workshop" }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((map) => map.name === "de_lake")?.workshopId).toBeUndefined();
  });

  it("marks mounted map names as Workshop and retains explicit version IDs", () => {
    expect(mergeServerMaps([{ name: "de_lake", category: "Defusal" }], [{ name: "de_lake", category: "Workshop" }])).toEqual([{ name: "de_lake", category: "Workshop" }]);
    expect(mergeServerMaps([{ name: "de_lake", category: "Workshop", workshopId: "111" }], [{ name: "de_lake", category: "Workshop", workshopId: "222" }])).toHaveLength(2);
  });
  it("reads the filename-per-line output from ds_workshop_listmaps", () => {
    expect(parseWorkshopMapList("aim_botz\r\nsurf_utopia.vpk\n3: awp_lego2\n")).toEqual([
      { name: "aim_botz", category: "Workshop" },
      { name: "awp_lego2", category: "Workshop" },
      { name: "surf_utopia", category: "Workshop" },
    ]);
  });

  it("merges mounted Workshop names with maps-star results", () => {
    const merged = mergeServerMaps(
      [{ name: "de_mirage", category: "Defusal" }],
      [{ name: "aim_botz", category: "Workshop" }, { name: "surf_utopia", category: "Workshop" }],
    );
    expect(merged).toEqual([
      { name: "aim_botz", category: "Workshop" },
      { name: "de_mirage", category: "Defusal" },
      { name: "surf_utopia", category: "Workshop" },
    ]);
  });
});

describe("parseCvarList", () => {
  it("parses Source 2 colon output and classic equals output", () => {
    const commands = parseCvarList(`status : cmd : release : Print server status\nmp_freezetime : 15 : sv, replicated : Freeze time\n"sv_cheats" = "0" cheat,replicated - Allow cheats`);
    expect(commands).toHaveLength(3);
    expect(commands.find((command) => command.name === "mp_freezetime")).toMatchObject({ value: "15", description: "Freeze time" });
    expect(commands.find((command) => command.name === "sv_cheats")?.value).toBe("0");
  });
});

describe("parseIntegerCvar", () => {
  it("reads quoted, colon, and plain numeric ConVar responses", () => {
    expect(parseIntegerCvar(`"game_type" = "1" ( def. "0" )`, "game_type")).toBe(1);
    expect(parseIntegerCvar("game_mode : 5", "game_mode")).toBe(5);
    expect(parseIntegerCvar("2", "game_mode")).toBe(2);
    expect(parseIntegerCvar("Unknown command", "game_mode")).toBeNull();
  });
});


describe("moderation identifiers", () => {
  it("rejects incomplete Steam IDs in text status and JSON enrichment", () => {
    expect(parseStatus(STATUS.replace("STEAM_1:1:12345", "STEAM_invalid")).players.some((player) => player.userId === "2")).toBe(false);
    const snapshot = parseStatus(STATUS);
    const result = enrichStatusWithJson(snapshot, JSON.stringify({ server: { clients: [{ name: "Player One", steamid: "STEAM_invalid" }] } }));
    expect(result.players[0].steamId).toBe("STEAM_1:1:12345");
  });
});
