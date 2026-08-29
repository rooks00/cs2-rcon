import type { CommandDefinition, ServerMap } from "@/lib/types";

export type GameModeCompatibility = "Built-in" | "Map dependent" | "Legacy definition";

export interface GameModePreset {
  id: string;
  name: string;
  internalName: string;
  type: number;
  mode: number;
  typeName: string;
  maxPlayers: number;
  description: string;
  compatibility: GameModeCompatibility;
}

// Values are from CS2's current game/csgo/pak01_dir/gamemodes.txt.
export const GAME_MODE_PRESETS: GameModePreset[] = [
  { id: "casual", name: "Casual", internalName: "casual", type: 0, mode: 0, typeName: "Classic", maxPlayers: 20, description: "Classic objectives with shorter rounds, free armor, and relaxed team rules.", compatibility: "Built-in" },
  { id: "competitive", name: "Competitive", internalName: "competitive", type: 0, mode: 1, typeName: "Classic", maxPlayers: 10, description: "The standard 5v5 ruleset with friendly fire and team-only spectating.", compatibility: "Built-in" },
  { id: "wingman", name: "Wingman", internalName: "scrimcomp2v2", type: 0, mode: 2, typeName: "Classic", maxPlayers: 4, description: "Compact 2v2 competitive rules for Wingman-compatible map areas.", compatibility: "Built-in" },
  { id: "weapons-expert", name: "Weapons Expert", internalName: "scrimcomp5v5", type: 0, mode: 3, typeName: "Classic", maxPlayers: 10, description: "Competitive rules with per-match weapon purchase restrictions.", compatibility: "Map dependent" },
  { id: "training-day", name: "Training Day", internalName: "new_user_training", type: 0, mode: 4, typeName: "Classic", maxPlayers: 10, description: "Valve's guided new-player training ruleset and configuration.", compatibility: "Map dependent" },
  { id: "retakes", name: "Retakes", internalName: "retakes", type: 0, mode: 5, typeName: "Classic", maxPlayers: 7, description: "Fast post-plant retake scenarios using the current first-class Retakes mode.", compatibility: "Built-in" },
  { id: "arms-race", name: "Arms Race", internalName: "gungameprogressive", type: 1, mode: 0, typeName: "Gun Game", maxPlayers: 16, description: "Progress through the weapon ladder by earning kills.", compatibility: "Built-in" },
  { id: "demolition", name: "Demolition", internalName: "gungametrbomb", type: 1, mode: 1, typeName: "Gun Game", maxPlayers: 16, description: "Round-based bomb objectives with weapon progression.", compatibility: "Map dependent" },
  { id: "deathmatch", name: "Deathmatch", internalName: "deathmatch", type: 1, mode: 2, typeName: "Gun Game", maxPlayers: 16, description: "Continuous respawns and score-based free-form combat.", compatibility: "Built-in" },
  { id: "training", name: "Training", internalName: "training", type: 2, mode: 0, typeName: "Training", maxPlayers: 1, description: "Single-player training configuration for dedicated training maps.", compatibility: "Map dependent" },
  { id: "custom", name: "Custom", internalName: "custom", type: 3, mode: 0, typeName: "Custom", maxPlayers: 100, description: "A neutral baseline intended for custom maps, configs, and plugins.", compatibility: "Built-in" },
  { id: "guardian", name: "Guardian", internalName: "cooperative", type: 4, mode: 0, typeName: "Cooperative", maxPlayers: 20, description: "Cooperative defense rules; requires compatible map logic and objectives.", compatibility: "Map dependent" },
  { id: "coop-strike", name: "Co-op Strike", internalName: "coopmission", type: 4, mode: 1, typeName: "Cooperative", maxPlayers: 10, description: "Mission-oriented cooperative rules for compatible scenario maps.", compatibility: "Map dependent" },
  { id: "war-games", name: "War Games", internalName: "skirmish", type: 5, mode: 0, typeName: "Skirmish", maxPlayers: 16, description: "A legacy skirmish shell whose actual rules require additional mode flags.", compatibility: "Legacy definition" },
  { id: "danger-zone", name: "Danger Zone", internalName: "survival", type: 6, mode: 0, typeName: "Free For All", maxPlayers: 16, description: "The legacy survival definition; requires Danger Zone content and maps.", compatibility: "Legacy definition" },
];

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
  { name: "game_type", syntax: "game_type <0-6>", description: "Set the game type used when the next map initializes", category: "Game mode", dangerous: true },
  { name: "game_mode", syntax: "game_mode <value>", description: "Set the mode within the selected game type", category: "Game mode", dangerous: true },
  { name: "game_alias", syntax: "game_alias <alias>", description: "Set game type and mode from a supported alias", category: "Game mode", dangerous: true },
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

export function getMapChangeCommand(map: ServerMap): string {
  if (map.workshopId && /^\d+$/.test(map.workshopId)) return `host_workshop_map ${map.workshopId}`;
  if (map.category === "Workshop") return `ds_workshop_changelevel ${map.name}`;
  return `changelevel ${map.name}`;
}

export function categorizeMap(name: string): ServerMap["category"] {
  if (name.includes("workshop/") || /^workshop_/.test(name)) return "Workshop";
  if (name.startsWith("de_")) return "Defusal";
  if (name.startsWith("cs_")) return "Hostage";
  if (name.startsWith("ar_") || name.startsWith("gd_") || name.includes("wingman")) return "Wingman";
  return "Custom";
}
