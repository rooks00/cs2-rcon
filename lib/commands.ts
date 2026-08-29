import type { CommandDefinition, ServerMap } from "@/lib/types";

export const DEFAULT_MAPS: ServerMap[] = [
  { name: "de_ancient", category: "Defusal" },
  { name: "de_cache", category: "Defusal" },
  { name: "de_dust2", category: "Defusal" },
  { name: "de_inferno", category: "Defusal" },
  { name: "de_mirage", category: "Defusal" },
  { name: "de_nuke", category: "Defusal" },
  { name: "de_overpass", category: "Defusal" },
  { name: "de_train", category: "Defusal" },
  { name: "de_vertigo", category: "Defusal" },
  { name: "cs_italy", category: "Hostage" },
  { name: "cs_office", category: "Hostage" },
];

export const COMMAND_LIBRARY: CommandDefinition[] = [
  { name: "status", syntax: "status", description: "Server details and connected players", category: "Inspect" },
  { name: "users", syntax: "users", description: "Compact connected-user list", category: "Inspect" },
  { name: "maps", syntax: "maps *", description: "List maps installed on the server", category: "Inspect" },
  { name: "cvarlist", syntax: "cvarlist", description: "List every command and ConVar exposed by this server", category: "Inspect" },
  { name: "find", syntax: "find <text>", description: "Find server commands and ConVars", category: "Inspect" },
  { name: "listid", syntax: "listid", description: "List Steam account bans", category: "Moderation" },
  { name: "listip", syntax: "listip", description: "List IP bans", category: "Moderation" },
  { name: "kickid", syntax: "kickid <userid> <reason>", description: "Kick a connected player by user ID", category: "Moderation", dangerous: true },
  { name: "banid", syntax: "banid <minutes> <steamid> kick", description: "Ban a Steam account; 0 means permanent", category: "Moderation", dangerous: true },
  { name: "addip", syntax: "addip <minutes> <ip>", description: "Ban an IP address; 0 means permanent", category: "Moderation", dangerous: true },
  { name: "removeid", syntax: "removeid <steamid>", description: "Remove a Steam account ban", category: "Moderation", dangerous: true },
  { name: "removeip", syntax: "removeip <ip>", description: "Remove an IP ban", category: "Moderation", dangerous: true },
  { name: "writeid", syntax: "writeid", description: "Persist Steam account bans to disk", category: "Moderation" },
  { name: "writeip", syntax: "writeip", description: "Persist IP bans to disk", category: "Moderation" },
  { name: "say", syntax: "say <message>", description: "Broadcast a chat message", category: "Players" },
  { name: "changelevel", syntax: "changelevel <map>", description: "Change map while retaining server state", category: "Maps", dangerous: true },
  { name: "map", syntax: "map <map>", description: "Load a map with a clean reset", category: "Maps", dangerous: true },
  { name: "host_workshop_map", syntax: "host_workshop_map <workshop_id>", description: "Download and load a Workshop map", category: "Maps", dangerous: true },
  { name: "ds_workshop_listmaps", syntax: "ds_workshop_listmaps", description: "List maps in the loaded Workshop collection", category: "Maps" },
  { name: "mp_restartgame", syntax: "mp_restartgame 1", description: "Restart the match after a delay", category: "Match", dangerous: true },
  { name: "mp_warmup_end", syntax: "mp_warmup_end", description: "End warmup immediately", category: "Match" },
  { name: "mp_pause_match", syntax: "mp_pause_match", description: "Pause the current match", category: "Match" },
  { name: "mp_unpause_match", syntax: "mp_unpause_match", description: "Resume the current match", category: "Match" },
  { name: "exec", syntax: "exec <config>", description: "Execute a server config file", category: "Server", dangerous: true },
  { name: "hostname", syntax: "hostname <name>", description: "Change the public server name", category: "Server" },
  { name: "sv_password", syntax: "sv_password <password>", description: "Set or clear the join password", category: "Server" },
  { name: "bot_add", syntax: "bot_add", description: "Add a bot", category: "Bots" },
  { name: "bot_add_ct", syntax: "bot_add_ct", description: "Add a Counter-Terrorist bot", category: "Bots" },
  { name: "bot_add_t", syntax: "bot_add_t", description: "Add a Terrorist bot", category: "Bots" },
  { name: "bot_kick", syntax: "bot_kick", description: "Remove all bots", category: "Bots", dangerous: true },
  { name: "bot_quota", syntax: "bot_quota <count>", description: "Set the desired bot count", category: "Bots" },
];

export function quoteRcon(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ")}"`;
}

export function categorizeMap(name: string): ServerMap["category"] {
  if (name.includes("workshop/") || /^workshop_/.test(name)) return "Workshop";
  if (name.startsWith("de_")) return "Defusal";
  if (name.startsWith("cs_")) return "Hostage";
  if (name.startsWith("ar_") || name.startsWith("gd_") || name.includes("wingman")) return "Wingman";
  return "Custom";
}
