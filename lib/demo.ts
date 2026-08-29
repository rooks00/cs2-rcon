const DEMO_STATUS = `hostname: RELAY // PRACTICE EU
version : 1.41.3.2/14132 10581 secure
udp/ip  : 203.0.113.42:27015
os      : Linux
type    : dedicated
map     : de_mirage
players : 5 humans, 1 bots (12 max) (not hibernating)

# userid name uniqueid connected ping loss state rate adr
# 2 1 "sapphire" [U:1:12844192] 42:18 18 0 active 786432 198.51.100.11:27005
# 4 2 "northstar" STEAM_1:0:18273645 31:04 27 0 active 786432 198.51.100.12:27005
# 7 3 "planting default" [U:1:90182733] 18:52 42 1 active 786432 198.51.100.13:27005
# 9 4 "r0ver" 76561198012345678 12:07 64 0 active 786432 198.51.100.14:27005
# 12 5 "Mika" [U:1:55081231] 03:44 21 0 active 786432 198.51.100.15:27005
# 13 6 "Gabe" BOT active 64`;

const DEMO_MAPS = `PENDING: (fs)maps/de_ancient.vpk
PENDING: (fs)maps/de_cache.vpk
PENDING: (fs)maps/de_dust2.vpk
PENDING: (fs)maps/de_inferno.vpk
PENDING: (fs)maps/de_mirage.vpk
PENDING: (fs)maps/de_nuke.vpk
PENDING: (fs)maps/de_overpass.vpk
PENDING: (fs)maps/de_train.vpk
PENDING: (fs)maps/de_vertigo.vpk
PENDING: (fs)maps/cs_italy.vpk
PENDING: (fs)maps/cs_office.vpk
PENDING: (fs)maps/workshop/3070244462/aim_botz.vpk`;

const DEMO_CVARS = `status : cmd : release : Print connection and server status
maps : cmd : release : Displays list of maps
changelevel : cmd : release : Change server to the specified map
mp_restartgame : 0 : sv, release : Restart the game in the specified number of seconds
mp_freezetime : 15 : sv, replicated, release : How many seconds to keep players frozen
sv_cheats : 0 : sv, cheat, replicated : Allow cheats on server
bot_quota : 0 : sv, replicated : Determines the total number of bots in the game
say : cmd : sv : Display a message to everyone
listid : cmd : sv : Lists banned users
removeid : cmd : sv : Remove a user ID from the ban list`;

const DEMO_STATUS_JSON = JSON.stringify({
  server: {
    map: "de_mirage",
    clients_human: 5,
    clients_bot: 1,
    clients: [
      { steamid64: "76561197973109920", steamid: "[U:1:12844192]", bot: false, name: "sapphire" },
      { steamid64: "76561198096813018", steamid: "STEAM_1:0:18273645", bot: false, name: "northstar" },
      { steamid64: "76561198050448461", steamid: "[U:1:90182733]", bot: false, name: "planting default" },
      { steamid64: "76561198012345678", steamid: "[U:1:26039975]", bot: false, name: "r0ver" },
      { steamid64: "76561198015346959", steamid: "[U:1:55081231]", bot: false, name: "Mika" },
      { steamid64: "0", steamid: "[I:0:0]", bot: true, name: "Gabe" },
    ],
  },
});

let demoGameType = 0;
let demoGameMode = 1;

export async function executeDemoCommand(command: string): Promise<{ response: string; durationMs: number }> {
  const started = performance.now();
  await new Promise((resolve) => window.setTimeout(resolve, 180 + Math.random() * 220));
  const normalized = command.trim().toLowerCase();
  let response = "";

  if (normalized === "status") response = DEMO_STATUS;
  else if (normalized === "status_json") response = DEMO_STATUS_JSON;
  else if (/^game_type(?:\s+-?\d+)?$/.test(normalized)) {
    const nextValue = normalized.match(/^game_type\s+(-?\d+)$/)?.[1];
    if (nextValue !== undefined) demoGameType = Number(nextValue);
    response = `"game_type" = "${demoGameType}"`;
  }
  else if (/^game_mode(?:\s+-?\d+)?$/.test(normalized)) {
    const nextValue = normalized.match(/^game_mode\s+(-?\d+)$/)?.[1];
    if (nextValue !== undefined) demoGameMode = Number(nextValue);
    response = `"game_mode" = "${demoGameMode}"`;
  }
  else if (normalized === "maps *" || normalized === "maps") response = DEMO_MAPS;
  else if (normalized === "listid") response = `ID filter list:\n1 [U:1:77881221] : permanent\n2 STEAM_1:0:8827319 : 45 minutes`;
  else if (normalized === "listip") response = `IP filter list:\n1 198.51.100.88 : permanent`;
  else if (normalized === "cvarlist") response = DEMO_CVARS;
  else if (normalized.startsWith("find ")) response = DEMO_CVARS.split("\n").filter((line) => line.includes(normalized.slice(5))).join("\n") || "No commands found.";
  else if (/^(changelevel|map)\s+/.test(normalized)) response = `Changing level to ${command.trim().split(/\s+/).slice(1).join(" ")}...`;
  else if (/^(removeid|removeip)\s+/.test(normalized)) response = "Filter removed. Remember to write the ban list to persist this change.";
  else if (/^(banid|addip)\s+/.test(normalized)) response = "Added to server ban list.";
  else if (/^kickid\s+/.test(normalized)) response = "Kicked by Console.";
  else if (normalized === "writeid" || normalized === "writeip") response = "Ban list written to disk.";
  else if (normalized === "bot_add" || normalized === "bot_add_ct" || normalized === "bot_add_t") response = "Bot added.";
  else if (normalized === "bot_kick") response = "Kicked all bots.";
  else if (normalized.startsWith("say ")) response = "Message broadcast.";
  else if (normalized) response = `Demo accepted: ${command}\nConnect a live server to see its actual response.`;

  return { response, durationMs: Math.round(performance.now() - started) };
}

export { DEMO_STATUS };
