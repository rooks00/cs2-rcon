import { describe, expect, it } from "vitest";
import { enrichStatusWithJson, parseBanList, parseCvarList, parseMaps, parseStatus } from "../lib/parsers";

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
  it("extracts VPK paths and bare map rows", () => {
    const maps = parseMaps(`PENDING: (fs)maps/de_mirage.vpk\n/maps/workshop/123/aim_redline.vpk\n3. cs_office\nnoise`);
    expect(maps.map((map) => map.name)).toEqual(["aim_redline", "cs_office", "de_mirage"]);
    expect(maps.find((map) => map.name === "cs_office")?.category).toBe("Hostage");
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
