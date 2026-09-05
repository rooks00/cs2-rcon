"use client";

import {
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Download,
  Gamepad2,
  Globe2,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Map as MapIcon,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShieldOff,
  Star,
  Swords,
  Target,
  Trash2,
  TriangleAlert,
  Unplug,
  UserRoundX,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMAND_LIBRARY, DEFAULT_MAPS, GAME_MODE_PRESETS, getCommandCompletions, getMapChangeCommand, quoteRcon, type GameModePreset } from "@/lib/commands";
import { DEMO_STATUS, executeDemoCommand } from "@/lib/demo";
import { enrichStatusWithJson, mergeServerMaps, parseBanList, parseCvarList, parseIntegerCvar, parseMaps, parseStatus, parseWorkshopMapList } from "@/lib/parsers";
import { DEFAULT_STORED_STATE, exportStoredState, loadStoredState, saveStoredState } from "@/lib/storage";
import type {
  BanEntry,
  ConsoleEntry,
  RconApiResponse,
  RconCommandResult,
  ServerMap,
  ServerProfile,
  ServerSnapshot,
  StoredState,
} from "@/lib/types";
import { RelayLogo } from "@/components/relay-logo";
import { ConnectionPanel, type ConnectionPanelProps, type ConnectionInput } from "@/components/connection-panel";

type Section = "players" | "bans" | "maps" | "modes" | "console" | "settings";
type Secrets = { password: string; relayKey: string };
type Toast = { id: string; message: string; tone: "success" | "error" | "info" };
type ConsoleCommandOption = { name: string; syntax: string; description: string; meta: string };
type Confirmation = {
  title: string;
  body: string;
  label: string;
  tone?: "danger" | "warning";
  action: () => Promise<void>;
};

const DEMO_PROFILE: ServerProfile = {
  id: "demo",
  name: "Practice EU",
  host: "203.0.113.42",
  port: 27015,
  rememberSecrets: false,
  createdAt: 0,
};

const NAV_ITEMS: Array<{ id: Section; label: string }> = [
  { id: "console", label: "Console" },
  { id: "players", label: "Players" },
  { id: "bans", label: "Ban list" },
  { id: "maps", label: "Maps" },
  { id: "modes", label: "Game modes" },
];

const SECTION_COPY: Record<Section, { eyebrow: string; title: string; description: string }> = {
  players: { eyebrow: "Roster", title: "Connected players", description: "Inspect, kick, or ban the current roster." },
  bans: { eyebrow: "Moderation", title: "Ban list", description: "Steam and IP filters reported by the server." },
  maps: { eyebrow: "Rotation", title: "Server maps", description: "Browse installed maps and change level safely." },
  modes: { eyebrow: "Ruleset", title: "Game modes", description: "Manage the exact game_type and game_mode pair." },
  console: { eyebrow: "RCON", title: "Server console", description: "Commands, players, and match controls in one place." },
  settings: { eyebrow: "Local setup", title: "Settings", description: "Profiles, polling, and browser-only data." },
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(timestamp);
}

function formatRelative(timestamp?: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function avatarHue(value: string): number {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0) * 7, 0) % 360;
}

function initials(value: string): string {
  return value.replace(/[^a-z0-9 ]/gi, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
}

async function requestRcon(profile: ServerProfile, secrets: Secrets, commands: string[]): Promise<RconCommandResult[]> {
  const response = await fetch("/api/rcon", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secrets.relayKey ? { "x-relay-key": secrets.relayKey } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      host: profile.host,
      port: profile.port,
      password: secrets.password,
      commands,
    }),
  });
  const payload = (await response.json().catch(() => null)) as RconApiResponse | null;
  if (!response.ok || !payload?.ok || !payload.results) {
    throw new Error(payload?.error?.message ?? `Relay request failed (${response.status}).`);
  }
  return payload.results;
}

async function requestWorkshopTitles(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  try {
    const response = await fetch("/api/workshop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) return {};
    const payload: unknown = await response.json();
    const items = (payload as { items?: unknown })?.items;
    if (!Array.isArray(items)) return {};
    return Object.fromEntries(items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const detail = item as { id?: unknown; title?: unknown };
      return typeof detail.id === "string" && typeof detail.title === "string" ? [[detail.id, detail.title]] : [];
    }));
  } catch {
    return {};
  }
}

export function RconDashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [stored, setStored] = useState<StoredState>(() => loadStoredState());
  const [section, setSection] = useState<Section>("console");
  const [demoMode, setDemoMode] = useState(false);
  const [secrets, setSecrets] = useState<Secrets>(() => {
    const initial = loadStoredState();
    const profile = initial.profiles.find((item) => item.id === initial.activeProfileId);
    return { password: profile?.password ?? "", relayKey: profile?.relayKey ?? "" };
  });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [serverMaps, setServerMaps] = useState<ServerMap[]>(DEFAULT_MAPS);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [gameModeLoading, setGameModeLoading] = useState(false);
  const [currentGameMode, setCurrentGameMode] = useState<{ type: number; mode: number } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleBusy, setConsoleBusy] = useState(false);
  const [consoleSearch, setConsoleSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [mapSearch, setMapSearch] = useState("");
  const [banSearch, setBanSearch] = useState("");
  const [banKind, setBanKind] = useState<"all" | "steam" | "ip">("all");
  const [workshopId, setWorkshopId] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [historyCursor, setHistoryCursor] = useState(-1);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const activeProfile = useMemo(() => {
    if (demoMode) return DEMO_PROFILE;
    return stored.profiles.find((profile) => profile.id === stored.activeProfileId) ?? null;
  }, [demoMode, stored.activeProfileId, stored.profiles]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = makeId("toast");
    setToasts((items) => [...items.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
  }, []);

  useEffect(() => {
    queueMicrotask(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && !saveStoredState(stored)) queueMicrotask(() => notify("Browser storage is unavailable or full. Your current session still works, but changes could not be saved.", "error"));
  }, [hydrated, stored, notify]);

  const runCommands = useCallback(async (commands: string[], profileOverride?: ServerProfile, secretsOverride?: Secrets) => {
    const profile = profileOverride ?? activeProfile;
    const auth = secretsOverride ?? secrets;
    if (!profile) throw new Error("Choose a server profile first.");
    if (profile.id === "demo" || demoMode) {
      const results: RconCommandResult[] = [];
      for (const command of commands) {
        const result = await executeDemoCommand(command);
        results.push({ command, ...result });
      }
      return results;
    }
    if (!auth.password) throw new Error("Enter the RCON password to continue.");
    const results: RconCommandResult[] = [];
    for (let index = 0; index < commands.length; index += 8) {
      results.push(...await requestRcon(profile, auth, commands.slice(index, index + 8)));
    }
    return results;
  }, [activeProfile, demoMode, secrets]);

  const refreshStatus = useCallback(async (silent = false) => {
    if (!activeProfile) return;
    if (!silent) setRefreshing(true);
    try {
      const [result, jsonResult] = await runCommands(["status", "status_json"]);
      const parsed = parseStatus(result.response);
      setSnapshot(jsonResult ? enrichStatusWithJson(parsed, jsonResult.response) : parsed);
      setLastLatency(result.durationMs + (jsonResult?.durationMs ?? 0));
      setConnected(true);
    } catch (error) {
      setConnected(false);
      if (!silent) notify(error instanceof Error ? error.message : "Unable to refresh server status.", "error");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [activeProfile, notify, runCommands]);

  useEffect(() => {
    if (!connected || !activeProfile || stored.refreshSeconds <= 0) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus(true);
    }, stored.refreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [activeProfile, connected, refreshStatus, stored.refreshSeconds]);

  useEffect(() => {
    if (section === "console") {
      const output = terminalEndRef.current?.parentElement;
      if (output) output.scrollTop = output.scrollHeight;
    }
  }, [section, stored.consoleHistory]);

  const addHistory = useCallback((entry: ConsoleEntry) => {
    setStored((current) => ({ ...current, consoleHistory: [entry, ...current.consoleHistory.filter((item) => item.id !== entry.id)].slice(0, 100) }));
  }, []);

  const executeConsole = useCallback(async (rawCommand?: string) => {
    const command = (rawCommand ?? consoleInput).trim();
    if (!command || consoleBusy) return;
    setConsoleInput("");
    setHistoryCursor(-1);
    setConsoleBusy(true);
    const entry: ConsoleEntry = { id: makeId("command"), command, response: "", status: "pending", timestamp: Date.now() };
    addHistory(entry);
    try {
      const [result] = await runCommands([command]);
      addHistory({ ...entry, response: result.response || "Command completed with no output.", status: "success", durationMs: result.durationMs });
      setLastLatency(result.durationMs);
      if (/^(changelevel|map)\s+/i.test(command)) {
        const map = command.split(/\s+/).slice(1).join(" ").replace(/^"|"$/g, "");
        setSnapshot((current) => current ? { ...current, map, updatedAt: Date.now() } : current);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed.";
      addHistory({ ...entry, response: message, status: "error" });
      notify(message, "error");
    } finally {
      setConsoleBusy(false);
    }
  }, [addHistory, consoleBusy, consoleInput, notify, runCommands]);

  const connectProfile = useCallback(async (profile: ServerProfile, nextSecrets: Secrets) => {
    setConnecting(true);
    try {
      const statusResults = profile.id === "demo"
        ? [{ command: "status", response: DEMO_STATUS, durationMs: 236 }]
        : await requestRcon(profile, nextSecrets, ["status", "status_json"]);
      const parsed = parseStatus(statusResults[0].response);
      setSnapshot(statusResults[1] ? enrichStatusWithJson(parsed, statusResults[1].response) : parsed);
      setLastLatency(statusResults.reduce((total, result) => total + result.durationMs, 0));
      setSecrets(nextSecrets);
      setDemoMode(profile.id === "demo");
      setConnected(true);
      setConnectOpen(false);
      setSection("console");
      for (const result of statusResults.filter((result) => result.command === "status")) {
        addHistory({ id: makeId("command"), command: result.command, response: result.response || "Command completed with no output.", status: "success", timestamp: Date.now(), durationMs: result.durationMs });
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Connection failed.", "error");
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [addHistory, notify]);

  const saveAndConnect = useCallback(async (input: ConnectionInput) => {
    const profile: ServerProfile = {
      id: input.id ?? makeId("server"),
      name: input.name.trim() || input.host.trim(),
      host: input.host.trim(),
      port: input.port,
      rememberSecrets: input.rememberSecrets,
      createdAt: Date.now(),
      ...(input.rememberSecrets ? { password: input.password, relayKey: input.relayKey } : {}),
    };
    await connectProfile(profile, { password: input.password, relayKey: input.relayKey });
    setStored((current) => ({
      ...current,
      activeProfileId: profile.id,
      profiles: [profile, ...current.profiles.filter((item) => item.id !== profile.id)],
    }));
  }, [connectProfile]);

  const switchProfile = async (profile: ServerProfile) => {
    if (!profile.password) {
      setStored((current) => ({ ...current, activeProfileId: profile.id }));
      setSecrets({ password: "", relayKey: profile.relayKey ?? "" });
      setConnected(false);
      setSnapshot(null);
      setConnectOpen(true);
      return;
    }
    setStored((current) => ({ ...current, activeProfileId: profile.id }));
    await connectProfile(profile, { password: profile.password, relayKey: profile.relayKey ?? "" }).catch(() => undefined);
  };

  const refreshBans = async () => {
    setBansLoading(true);
    try {
      const results = await runCommands(["listid", "listip"]);
      setBans([...parseBanList(results[0].response, "steam"), ...parseBanList(results[1].response, "ip")]);
      notify("Ban list refreshed.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load bans.", "error");
    } finally {
      setBansLoading(false);
    }
  };

  const refreshMaps = async () => {
    setMapsLoading(true);
    try {
      const [result, workshopResult] = await runCommands(["maps *", "ds_workshop_listmaps"]);
      const parsed = mergeServerMaps(parseMaps(result.response), parseWorkshopMapList(workshopResult.response));
      const workshopIds = [...new Set(parsed.flatMap((map) => map.workshopId ? [map.workshopId] : []))];
      const titles = await requestWorkshopTitles(workshopIds);
      const enriched = parsed.map((map) => map.workshopId && titles[map.workshopId] ? { ...map, displayName: titles[map.workshopId] } : map);
      if (enriched.length) setServerMaps(enriched);
      notify(parsed.length ? `Found ${parsed.length} installed maps.` : "No map names were found in the server response.", parsed.length ? "success" : "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load maps.", "error");
    } finally {
      setMapsLoading(false);
    }
  };

  const refreshGameMode = async (announce = true) => {
    setGameModeLoading(true);
    try {
      const [typeResult, modeResult] = await runCommands(["game_type", "game_mode"]);
      const type = parseIntegerCvar(typeResult.response, "game_type");
      const mode = parseIntegerCvar(modeResult.response, "game_mode");
      if (type === null || mode === null) throw new Error("The server did not return numeric game_type and game_mode values.");
      setCurrentGameMode({ type, mode });
      if (announce) notify("Game mode values refreshed.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not read the current game mode.", "error");
    } finally {
      setGameModeLoading(false);
    }
  };

  const stageGameMode = async (preset: GameModePreset) => {
    const commands = [`game_type ${preset.type}`, `game_mode ${preset.mode}`];
    const results = await runCommands(commands);
    for (const result of results) {
      addHistory({
        id: makeId("command"),
        command: result.command,
        response: result.response || "Command completed with no output.",
        status: "success",
        timestamp: Date.now(),
        durationMs: result.durationMs,
      });
    }
    setCurrentGameMode({ type: preset.type, mode: preset.mode });
    notify(`${preset.name} staged safely. It will initialize on the next deliberate map change.`, "success");
  };

  const syncCatalog = async () => {
    setCatalogLoading(true);
    try {
      const [result] = await runCommands(["cvarlist"]);
      const parsed = parseCvarList(result.response);
      setStored((current) => ({ ...current, syncedCommands: parsed }));
      notify(`Synced ${parsed.length.toLocaleString()} commands from this server.`, parsed.length ? "success" : "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not sync command catalogue.", "error");
    } finally {
      setCatalogLoading(false);
    }
  };

  const runQuick = async (command: string, successMessage: string) => {
    try {
      const [result] = await runCommands([command]);
      setLastLatency(result.durationMs);
      notify(successMessage, "success");
      addHistory({ id: makeId("command"), command, response: result.response || "Command completed with no output.", status: "success", timestamp: Date.now(), durationMs: result.durationMs });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Command failed.", "error");
      throw error;
    }
  };

  const confirmAction = (details: Confirmation) => setConfirmation(details);

  const completeConfirmation = async () => {
    if (!confirmation) return;
    setConfirmationBusy(true);
    try {
      await confirmation.action();
      setConfirmation(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The server action failed.", "error");
    } finally {
      setConfirmationBusy(false);
    }
  };

  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    return (snapshot?.players ?? []).filter((player) => !query || `${player.name} ${player.steamId} ${player.address ?? ""}`.toLowerCase().includes(query));
  }, [playerSearch, snapshot?.players]);

  const filteredBans = useMemo(() => {
    const query = banSearch.trim().toLowerCase();
    return bans.filter((entry) => (banKind === "all" || entry.kind === banKind) && (!query || entry.value.toLowerCase().includes(query)));
  }, [banKind, banSearch, bans]);

  const filteredMaps = useMemo(() => {
    const query = mapSearch.trim().toLowerCase();
    return serverMaps.filter((map) => !query || `${map.displayName ?? ""} ${map.name} ${map.workshopId ?? ""} ${map.category}`.toLowerCase().includes(query));
  }, [mapSearch, serverMaps]);

  const commandCatalogue = useMemo<ConsoleCommandOption[]>(() => {
    const builtIns = COMMAND_LIBRARY.map((command) => ({
      name: command.name,
      syntax: command.syntax,
      description: command.description,
      meta: command.category,
    }));
    const synced = stored.syncedCommands.map((command) => ({
      name: command.name,
      syntax: command.name,
      description: command.description || "Server command or ConVar",
      meta: command.value || command.flags || "Server",
    }));
    const merged = new Map([...builtIns, ...synced].map((item) => [item.name.toLowerCase(), item]));
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [stored.syncedCommands]);

  const filteredCommands = useMemo(() => {
    const query = consoleSearch.trim().toLowerCase();
    return commandCatalogue.filter((item) => !query || `${item.name} ${item.syntax} ${item.description} ${item.meta}`.toLowerCase().includes(query)).slice(0, 200);
  }, [commandCatalogue, consoleSearch]);

  const commandCompletions = useMemo(() => getCommandCompletions(commandCatalogue, consoleInput), [commandCatalogue, consoleInput]);

  const handleConsoleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const commands = stored.consoleHistory.filter((entry) => entry.status !== "pending").map((entry) => entry.command);
    if (event.key === "ArrowUp" && commands.length) {
      event.preventDefault();
      const next = Math.min(historyCursor + 1, commands.length - 1);
      setHistoryCursor(next);
      setConsoleInput(commands[next]);
    } else if (event.key === "ArrowDown" && historyCursor >= 0) {
      event.preventDefault();
      const next = historyCursor - 1;
      setHistoryCursor(next);
      setConsoleInput(next >= 0 ? commands[next] : "");
    }
  };

  const disconnect = () => {
    setConnected(false);
    setSnapshot(null);
    setDemoMode(false);
    setSecrets({ password: "", relayKey: secrets.relayKey });
    setConnectOpen(false);
    setSection("console");
  };

  if (!hydrated) {
    return (
      <main className="boot-screen">
        <RelayLogo />
        <div className="boot-line"><span /></div>
        <p>Opening your console</p>
      </main>
    );
  }

  const pageCopy = SECTION_COPY[section];

  return (
    <div className={`app-shell ${connected ? "app-shell--connected" : "app-shell--welcome"}`}>
      <header className="topbar">
        <button className="topbar__brand" onClick={() => setSection("console")} aria-label="Relay home"><RelayLogo /><span className="brand-subtitle">for Counter-Strike 2</span></button>
        {connected && (
          <nav className="main-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={section === item.id ? "is-active" : ""} aria-label={item.label} aria-current={section === item.id ? "page" : undefined} onClick={() => {
                setSection(item.id);
                if (item.id === "modes") void refreshGameMode(false);
              }}>
                {item.label}
                {item.id === "players" && snapshot?.humans ? <em>{snapshot.humans}</em> : null}
              </button>
            ))}
          </nav>
        )}
        <div className="topbar__actions">
          <a className="topbar__link" href="/connection-guide">Connection guide</a>
          <button className={`icon-button ${section === "settings" ? "is-active" : ""}`} onClick={() => setSection("settings")} aria-label="Settings" title="Settings"><Settings size={18} /></button>
          {(connected || section === "settings") && <button className="button button--secondary topbar-connect" onClick={() => setConnectOpen(true)}><Plus size={15} />Connect server</button>}
        </div>
      </header>

      <main className="workspace" id="main-content">
        <div className="content-wrap">
          {(connected || section === "settings") && (
            <div className="page-heading">
              <div>
                <h1>{pageCopy.title}</h1>
                <p>{section === "console" && activeProfile ? activeProfile.name : pageCopy.description}</p>
              </div>
              {connected && (
                <div className="session-heading-actions">
                  <span className="connection-pill is-online"><span className="pulse-dot" />{demoMode ? "Demo session" : "Connected"}</span>
                  <button className="icon-button" onClick={() => void refreshStatus()} disabled={refreshing} aria-label="Refresh status" title={`Updated ${formatRelative(snapshot?.updatedAt)}`}><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
                  <button className="icon-button" onClick={disconnect} aria-label="Disconnect server" title="Disconnect server"><Unplug size={16} /></button>
                </div>
              )}
            </div>
          )}

          {!connected && section !== "settings" ? (
            <ConnectionWorkspace key={activeProfile?.id ?? "new"} profiles={stored.profiles} activeProfile={demoMode ? null : activeProfile} secrets={secrets} busy={connecting} onSave={saveAndConnect} onDemo={() => void connectProfile(DEMO_PROFILE, { password: "demo", relayKey: "" })} />
          ) : (
            <>
              {section === "players" && snapshot && (
                <PlayersView
                  players={filteredPlayers}
                  total={snapshot.players.length}
                  search={playerSearch}
                  setSearch={setPlayerSearch}
                  onRefresh={() => void refreshStatus()}
                  refreshing={refreshing}
                  onKick={(player) => confirmAction({
                    title: `Kick ${player.name}?`,
                    body: "They will be removed from the current server session but can reconnect.",
                    label: "Kick player",
                    tone: "warning",
                    action: async () => {
                      await runQuick(`kickid ${player.userId} ${quoteRcon("Removed by an administrator")}`, `${player.name} was kicked.`);
                      await refreshStatus(true);
                    },
                  })}
                  onBan={(player) => confirmAction({
                    title: `Permanently ban ${player.name}?`,
                    body: `${player.steamId} will be added to the server ban list and kicked immediately. The updated list will be written to disk.`,
                    label: "Ban permanently",
                    tone: "danger",
                    action: async () => {
                      await runCommands([`banid 0 ${player.steamId} kick`, "writeid"]);
                      notify(`${player.name} was permanently banned.`, "success");
                      await refreshStatus(true);
                    },
                  })}
                />
              )}
              {section === "bans" && (
                <BansView
                  bans={filteredBans}
                  total={bans.length}
                  loading={bansLoading}
                  search={banSearch}
                  setSearch={setBanSearch}
                  kind={banKind}
                  setKind={setBanKind}
                  onRefresh={() => void refreshBans()}
                  onUnban={(entry) => confirmAction({
                    title: `Remove this ${entry.kind === "steam" ? "Steam" : "IP"} ban?`,
                    body: `${entry.value} will be able to connect again once the server accepts the updated filter list.`,
                    label: "Remove ban",
                    action: async () => {
                      const remove = entry.kind === "steam" ? "removeid" : "removeip";
                      const write = entry.kind === "steam" ? "writeid" : "writeip";
                      await runCommands([`${remove} ${entry.value}`, write]);
                      setBans((items) => items.filter((item) => item.id !== entry.id));
                      notify("Ban removed and list written to disk.", "success");
                    },
                  })}
                  onUnbanAll={() => confirmAction({
                    title: "Unban everyone?",
                    body: `This removes all ${bans.length} loaded Steam and IP bans, then writes both filter lists to disk. This cannot be undone from Relay.`,
                    label: `Unban all ${bans.length}`,
                    tone: "danger",
                    action: async () => {
                      const commands = bans.map((entry) => `${entry.kind === "steam" ? "removeid" : "removeip"} ${entry.value}`);
                      if (bans.some((entry) => entry.kind === "steam")) commands.push("writeid");
                      if (bans.some((entry) => entry.kind === "ip")) commands.push("writeip");
                      if (commands.length) await runCommands(commands);
                      setBans([]);
                      notify("All loaded bans were removed.", "success");
                    },
                  })}
                />
              )}
              {section === "maps" && snapshot && (
                <MapsView
                  maps={filteredMaps}
                  total={serverMaps.length}
                  currentMap={snapshot.map}
                  favorites={stored.favoriteMaps}
                  loading={mapsLoading}
                  search={mapSearch}
                  setSearch={setMapSearch}
                  workshopId={workshopId}
                  setWorkshopId={setWorkshopId}
                  onRefresh={() => void refreshMaps()}
                  onFavorite={(name) => setStored((current) => ({
                    ...current,
                    favoriteMaps: current.favoriteMaps.includes(name)
                      ? current.favoriteMaps.filter((map) => map !== name)
                      : [...current.favoriteMaps, name],
                  }))}
                  onChange={(map) => confirmAction({
                    title: `${map.category === "Workshop" ? "Change Workshop map" : "Change level"} to ${map.displayName ?? map.name}?`,
                    body: map.workshopId
                      ? `Relay identified Workshop item ${map.workshopId} from the server's installed-map path and will run host_workshop_map ${map.workshopId}. The current match will end while Steam mounts the map.`
                      : map.category === "Workshop"
                        ? `CS2 listed ${map.name} as an available Workshop collection map without exposing its published-file ID. Relay will use ds_workshop_changelevel ${map.name}, the dedicated command for an existing Workshop map.`
                        : "The current match will end and every connected player will load the selected map using changelevel.",
                    label: map.workshopId ? "Host Workshop map" : map.category === "Workshop" ? "Change Workshop map" : "Change level",
                    tone: "warning",
                    action: async () => {
                      const command = getMapChangeCommand(map);
                      await runQuick(command, map.category === "Workshop" ? `Workshop map ${map.displayName ?? map.name} requested.` : `Changing level to ${map.name}.`);
                      setSnapshot((current) => current ? { ...current, map: map.name, updatedAt: Date.now() } : current);
                    },
                  })}
                  onWorkshop={() => {
                    const id = workshopId.trim();
                    if (!/^\d{5,15}$/.test(id)) return notify("Enter the numeric Workshop item ID.", "error");
                    confirmAction({
                      title: `Load Workshop item ${id}?`,
                      body: "The server may download the map first. Players can be disconnected while the new level loads.",
                      label: "Load Workshop map",
                      tone: "warning",
                      action: async () => { await runQuick(`host_workshop_map ${id}`, `Workshop map ${id} requested.`); setWorkshopId(""); },
                    });
                  }}
                />
              )}
              {section === "modes" && snapshot && (
                <GameModesView
                  presets={GAME_MODE_PRESETS}
                  current={currentGameMode}
                  currentMap={snapshot.map}
                  loading={gameModeLoading}
                  onRefresh={() => void refreshGameMode()}
                  onStage={(preset) => void stageGameMode(preset).catch((error) => notify(error instanceof Error ? error.message : "Could not stage the game mode.", "error"))}
                />
              )}
              {section === "console" && snapshot && activeProfile && (
                <div className="console-workspace">
                  <ConsoleView
                    entries={stored.consoleHistory}
                    input={consoleInput}
                    setInput={setConsoleInput}
                    busy={consoleBusy}
                    search={consoleSearch}
                    setSearch={setConsoleSearch}
                    commands={filteredCommands}
                    completions={commandCompletions}
                    syncedCount={stored.syncedCommands.length}
                    syncing={catalogLoading}
                    snapshot={snapshot}
                    profile={activeProfile}
                    latency={lastLatency}
                    demoMode={demoMode}
                    onSync={() => void syncCatalog()}
                    onSubmit={() => void executeConsole()}
                    onKeyDown={handleConsoleKeyDown}
                    onUseCommand={(command) => setConsoleInput(command)}
                    onClear={() => setStored((current) => ({ ...current, consoleHistory: [] }))}
                    onCopy={(value) => { void navigator.clipboard.writeText(value).then(() => notify("Copied to clipboard.", "success")).catch(() => notify("Could not copy. Select the response and copy it manually.", "error")); }}
                    endRef={terminalEndRef}
                  />
                  <SessionControls
                    broadcast={broadcast}
                    setBroadcast={setBroadcast}
                    onBroadcast={() => {
                      const message = broadcast.trim();
                      if (!message) return;
                      setBroadcast("");
                      void runQuick(`say ${quoteRcon(message)}`, "Message sent to the server.").catch(() => undefined);
                    }}
                    onMaps={() => setSection("maps")}
                    onQuick={(command, title, body, label) => confirmAction({ title, body, label, tone: "warning", action: async () => { await runQuick(command, `${title} command sent.`); } })}
                  />
                </div>
              )}
              {section === "settings" && (
                <SettingsView
                  stored={stored}
                  activeProfile={activeProfile}
                  connected={connected}
                  demoMode={demoMode}
                  onAdd={() => { setDemoMode(false); setConnectOpen(true); }}
                  onSwitch={(profile) => void switchProfile(profile)}
                  onDelete={(profile) => confirmAction({
                    title: `Delete ${profile.name}?`,
                    body: "The local connection profile will be removed from this browser. Nothing changes on the game server.",
                    label: "Delete profile",
                    tone: "danger",
                    action: async () => {
                      setStored((current) => ({
                        ...current,
                        activeProfileId: current.activeProfileId === profile.id ? null : current.activeProfileId,
                        profiles: current.profiles.filter((item) => item.id !== profile.id),
                      }));
                      if (activeProfile?.id === profile.id) disconnect();
                      notify("Local profile deleted.", "success");
                    },
                  })}
                  onDisconnect={disconnect}
                  onRefreshChange={(seconds) => setStored((current) => ({ ...current, refreshSeconds: seconds }))}
                  onExport={() => downloadText("relay-settings.json", exportStoredState(stored))}
                  onClearData={() => confirmAction({
                    title: "Clear all local data?",
                    body: "Profiles, favorites, command history, and the synced catalogue will be removed from this browser.",
                    label: "Clear local data",
                    tone: "danger",
                    action: async () => {
                      setStored(DEFAULT_STORED_STATE);
                      setConnected(false);
                      setSnapshot(null);
                      setDemoMode(false);
                      setConnectOpen(true);
                    },
                  })}
                />
              )}
            </>
          )}
        </div>
      </main>

      {connectOpen && (
        <Modal onClose={() => !connecting && setConnectOpen(false)} labelledBy="connect-title" wide>
          <h2 id="connect-title" className="sr-only">Connect a CS2 server</h2>
          <ConnectionPanel profiles={stored.profiles} activeProfile={demoMode ? null : activeProfile} secrets={secrets} busy={connecting} onSave={saveAndConnect} onDemo={() => void connectProfile(DEMO_PROFILE, { password: "demo", relayKey: "" })} />
        </Modal>
      )}

      {confirmation && (
        <Modal onClose={() => !confirmationBusy && setConfirmation(null)} labelledBy="confirmation-title">
          <div className={`confirm-mark ${confirmation.tone ?? "warning"}`}>
            {confirmation.tone === "danger" ? <TriangleAlert size={22} /> : <Zap size={22} />}
          </div>
          <h2 id="confirmation-title">{confirmation.title}</h2>
          <p className="modal-copy">{confirmation.body}</p>
          <div className="modal-actions">
            <button className="button button--ghost" onClick={() => setConfirmation(null)} disabled={confirmationBusy}>Cancel</button>
            <button className={`button ${confirmation.tone === "danger" ? "button--danger" : "button--primary"}`} onClick={() => void completeConfirmation()} disabled={confirmationBusy}>
              {confirmationBusy && <LoaderCircle size={16} className="spin" />}{confirmation.label}
            </button>
          </div>
        </Modal>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.tone}`} key={toast.id}>
            {toast.tone === "success" ? <Check size={17} /> : toast.tone === "error" ? <TriangleAlert size={17} /> : <CircleDot size={17} />}
            <span>{toast.message}</span>
            <button onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Dismiss"><X size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionWorkspace(props: ConnectionPanelProps) {
  return (
    <section className="connection-workspace">
      <div className="connection-intro">
        <h1>Counter-Strike 2, from your browser.</h1>
        <p>Run commands, manage players, and change maps in one console.</p>
      </div>
      <ConnectionPanel {...props} />
    </section>
  );
}

interface SessionControlsProps {
  broadcast: string;
  setBroadcast: (value: string) => void;
  onBroadcast: () => void;
  onMaps: () => void;
  onQuick: (command: string, title: string, body: string, label: string) => void;
}

function SessionControls({ broadcast, setBroadcast, onBroadcast, onMaps, onQuick }: SessionControlsProps) {
  return (
    <details className="session-controls">
      <summary>Match controls <ChevronDown size={15} /></summary>
      <div className="session-controls__body">
        <div className="session-controls__buttons">
          <button className="button button--secondary" onClick={() => onQuick("mp_restartgame 1", "Restart match", "The match will restart after one second and current round progress will reset.", "Restart match")}><RotateCcw size={15} />Restart match</button>
          <button className="button button--secondary" onClick={() => onQuick("mp_warmup_end", "End warmup", "Warmup will end immediately and the configured match flow will continue.", "End warmup")}><Play size={15} />End warmup</button>
          <button className="button button--secondary" onClick={() => onQuick("mp_pause_match", "Pause match", "The server will pause the match using CS2's match pause command.", "Pause match")}><Pause size={15} />Pause match</button>
          <button className="button button--secondary" onClick={onMaps}><MapIcon size={15} />Change map</button>
        </div>
        <form className="broadcast-box" onSubmit={(event) => { event.preventDefault(); onBroadcast(); }}>
          <MessageSquare size={16} />
          <input aria-label="Broadcast message" value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder="Send a message to all players" maxLength={240} />
          <button type="submit" aria-label="Send broadcast" disabled={!broadcast.trim()}><Send size={15} /><span>Send</span></button>
        </form>
      </div>
    </details>
  );
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="panel-heading">
      <div><h2 title={eyebrow}>{title}</h2></div>
      {action}
    </div>
  );
}

function InlineEmpty({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) {
  return <div className="inline-empty"><Icon size={21} /><span><strong>{title}</strong><small>{copy}</small></span></div>;
}

interface PlayersViewProps {
  players: ServerSnapshot["players"];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onKick: (player: ServerSnapshot["players"][number]) => void;
  onBan: (player: ServerSnapshot["players"][number]) => void;
}

function PlayersView({ players, total, search, setSearch, onRefresh, refreshing, onKick, onBan }: PlayersViewProps) {
  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search players" placeholder="Search name, Steam ID, or address" /></div>
        <div className="toolbar-spacer" />
        <span className="record-count">{players.length} of {total}</span>
        <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""} />Refresh</button>
      </div>
      <div className="table-scroll">
        <table className="data-table player-table">
          <thead><tr><th>Player</th><th>Steam ID</th><th>Connected</th><th>Ping</th><th>State</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {players.map((player) => (
              <tr key={`${player.userId}-${player.steamId}`}>
                <td><div className="player-cell"><span className="player-avatar" style={{ "--avatar-hue": avatarHue(player.name) } as React.CSSProperties}>{player.isBot ? <Bot size={16} /> : initials(player.name)}</span><span><strong>{player.name}</strong><small>User ID {player.userId}{player.slot ? ` · Slot ${player.slot}` : ""}</small></span></div></td>
                <td><code className={`id-code ${!player.steamId ? "id-code--muted" : ""}`}>{player.steamId || "Not exposed by server"}</code></td>
                <td>{player.connected ?? "—"}</td>
                <td><span className={`ping ${player.ping && player.ping > 80 ? "ping--high" : ""}`}><i />{player.ping ?? "—"} ms</span></td>
                <td><span className="state-pill"><i />{player.state ?? "active"}</span></td>
                <td><div className="row-actions"><button className="icon-button icon-button--soft" onClick={() => onKick(player)} title="Kick player" aria-label={`Kick ${player.name}`}><UserRoundX size={16} /></button><button className="icon-button icon-button--danger" onClick={() => onBan(player)} disabled={player.isBot || !player.steamId} aria-label={`Ban ${player.name}`} title={player.steamId ? "Ban player" : "Steam ID was not exposed by this CS2 server"}><Ban size={16} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!players.length && <InlineEmpty icon={Users} title={search ? "No matching players" : "No players connected"} copy={search ? "Try a different search." : "Refresh when someone joins the server."} />}
    </section>
  );
}

interface BansViewProps {
  bans: BanEntry[];
  total: number;
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  kind: "all" | "steam" | "ip";
  setKind: (kind: "all" | "steam" | "ip") => void;
  onRefresh: () => void;
  onUnban: (entry: BanEntry) => void;
  onUnbanAll: () => void;
}

function BansView({ bans, total, loading, search, setSearch, kind, setKind, onRefresh, onUnban, onUnbanAll }: BansViewProps) {
  return (
    <div className="stack-lg">
      <section className="ban-summary panel">
        <span className="ban-summary__icon"><ShieldOff size={22} /></span>
        <div><p className="eyebrow">Active filters</p><h2>{total} banned {total === 1 ? "identity" : "identities"}</h2><p>Loaded directly from <code>listid</code> and <code>listip</code>.</p></div>
        <button className="button button--danger-outline" onClick={onUnbanAll} disabled={!total || loading}><Trash2 size={15} />Unban all</button>
      </section>
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div className="segmented">
            {(["all", "steam", "ip"] as const).map((value) => <button key={value} className={kind === value ? "is-active" : ""} onClick={() => setKind(value)}>{value === "all" ? "All bans" : value === "steam" ? "Steam IDs" : "IP addresses"}</button>)}
          </div>
          <div className="search-field search-field--compact"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search bans" placeholder="Search ban list" /></div>
          <div className="toolbar-spacer" />
          <button className="button button--secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{total ? "Refresh" : "Load bans"}</button>
        </div>
        {bans.length ? (
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Type</th><th>Identity</th><th>Duration</th><th>Source</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {bans.map((entry) => <tr key={entry.id}><td><span className={`type-pill type-pill--${entry.kind}`}>{entry.kind === "steam" ? <Gamepad2 size={13} /> : <Globe2 size={13} />}{entry.kind === "steam" ? "Steam" : "IP"}</span></td><td><code className="id-code">{entry.value}</code></td><td>{entry.duration}</td><td><span className="muted-cell">Server filter</span></td><td><button className="button button--tiny" onClick={() => onUnban(entry)}>Unban</button></td></tr>)}
          </tbody></table></div>
        ) : <div className="large-inline-empty"><span><ShieldCheck size={25} /></span><h3>{total ? "No matching bans" : "Ban list not loaded"}</h3><p>{total ? "Change the filters or search query." : "Load both Steam and IP filters from the server."}</p><button className="text-button" onClick={onRefresh}>{loading ? "Loading…" : "Load ban list"}<ChevronRight size={14} /></button></div>}
      </section>
    </div>
  );
}

interface MapsViewProps {
  maps: ServerMap[];
  total: number;
  currentMap: string;
  favorites: string[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  workshopId: string;
  setWorkshopId: (value: string) => void;
  onRefresh: () => void;
  onFavorite: (name: string) => void;
  onChange: (map: ServerMap) => void;
  onWorkshop: () => void;
}

function MapsView({ maps, total, currentMap, favorites, loading, search, setSearch, workshopId, setWorkshopId, onRefresh, onFavorite, onChange, onWorkshop }: MapsViewProps) {
  const sorted = [...maps].sort((a, b) => Number(favorites.includes(b.name)) - Number(favorites.includes(a.name)) || (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
  return (
    <div className="stack-lg">
      <section className="map-current panel">
        <div><p className="eyebrow">Now playing</p><h2>{currentMap}</h2><p><Radio size={14} />Active on the live server</p></div>
      </section>
      <section className="panel maps-panel">
        <div className="data-toolbar">
          <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search maps" placeholder="Search installed maps" /></div>
          <div className="toolbar-spacer" />
          <span className="record-count">{maps.length} of {total}</span>
          <button className="button button--secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />Sync server maps</button>
        </div>
        <div className="map-grid map-list">
          {sorted.map((map) => {
            const isCurrent = map.name === currentMap;
            const isFavorite = favorites.includes(map.name);
            const displayName = map.displayName ?? map.name;
            return (
              <article className={`map-card ${isCurrent ? "is-current" : ""}`} key={`${map.workshopId ?? "stock"}-${map.name}`}>
                <div className="map-card__body">
                  <span className="map-card__category">{map.category}{map.workshopId ? ` · #${map.workshopId}` : ""}</span>
                  <button className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} onClick={() => onFavorite(map.name)} aria-label={`${isFavorite ? "Remove" : "Add"} ${map.name} ${isFavorite ? "from" : "to"} favorites`}><Star size={15} fill={isFavorite ? "currentColor" : "none"} /></button>
                  <h3 title={displayName}>{displayName}</h3>
                  {map.workshopId && displayName !== map.name && <code className="map-card__internal">{map.name}</code>}
                  <button className={`button ${isCurrent ? "button--current" : "button--tiny"}`} onClick={() => !isCurrent && onChange(map)} disabled={isCurrent}>{isCurrent ? <><Radio size={13} />Current</> : <>{map.workshopId ? "Host Workshop map" : map.category === "Workshop" ? "Change Workshop map" : "Change level"} <ChevronRight size={13} /></>}</button>
                </div>
              </article>
            );
          })}
        </div>
        {!maps.length && <InlineEmpty icon={MapIcon} title="No matching maps" copy="Try another search or sync the installed map list." />}
      </section>
      <section className="workshop-panel panel">
        <span className="workshop-panel__icon"><Download size={20} /></span>
        <div><p className="eyebrow">Steam Workshop</p><h3>Load by Workshop ID</h3><p>The server downloads missing content before switching.</p></div>
        <div className="workshop-input"><input inputMode="numeric" value={workshopId} onChange={(event) => setWorkshopId(event.target.value.replace(/\D/g, ""))} aria-label="Workshop item ID" placeholder="3121800508" maxLength={15} /><button className="button button--primary" onClick={onWorkshop} disabled={!workshopId}>Load map</button></div>
      </section>
    </div>
  );
}

interface GameModesViewProps {
  presets: GameModePreset[];
  current: { type: number; mode: number } | null;
  currentMap: string;
  loading: boolean;
  onRefresh: () => void;
  onStage: (preset: GameModePreset) => void;
}

function GameModesView({ presets, current, currentMap, loading, onRefresh, onStage }: GameModesViewProps) {
  const [family, setFamily] = useState("All");
  const families = ["All", ...Array.from(new Set(presets.map((preset) => preset.typeName)))];
  const visiblePresets = family === "All" ? presets : presets.filter((preset) => preset.typeName === family);
  const currentPreset = current ? presets.find((preset) => preset.type === current.type && preset.mode === current.mode) : null;

  return (
    <div className="stack-lg mode-workspace">
      <section className="mode-current panel">
        <span className="mode-current__icon"><Target size={24} /></span>
        <div className="mode-current__copy">
          <p className="eyebrow">Server values</p>
          <h2>{loading ? "Reading game mode…" : currentPreset?.name ?? (current ? "Unknown mode pair" : "Not read yet")}</h2>
          <p>{currentPreset ? `${currentPreset.typeName} · ${currentPreset.internalName}` : "Read the live ConVars directly from the server."}</p>
        </div>
        <div className="mode-current__values">
          <span><small>game_type</small><strong>{current?.type ?? "—"}</strong></span>
          <i>/</i>
          <span><small>game_mode</small><strong>{current?.mode ?? "—"}</strong></span>
        </div>
        <button className="button button--secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />Refresh values</button>
      </section>

      <section className="mode-guidance panel">
        <span><Swords size={18} /></span>
        <div><strong>Safe mode changes never force a reload</strong><p>Relay only stages the two ConVars here. The matching Valve configs initialize when you deliberately leave <code>{currentMap}</code> from the Maps section, avoiding an automatic <code>map</code> command that can terminate Linux/Docker servers.</p></div>
      </section>

      <section className="panel mode-catalog">
        <div className="mode-toolbar">
          <div><p className="eyebrow">Valve definitions</p><h2>Game type matrix</h2></div>
          <div className="mode-filters" aria-label="Filter game modes by type">
            {families.map((item) => <button key={item} className={family === item ? "is-active" : ""} onClick={() => setFamily(item)}>{item}</button>)}
          </div>
        </div>
        <div className="mode-grid">
          {visiblePresets.map((preset) => {
            const isCurrent = current?.type === preset.type && current?.mode === preset.mode;
            const compatibilityClass = preset.compatibility.toLowerCase().replace(/\s+/g, "-");
            return (
              <article className={`mode-card ${isCurrent ? "is-current" : ""}`} key={preset.id}>
                <div className="mode-card__top">
                  <span className="mode-card__number">{preset.type}.{preset.mode}</span>
                  <span className={`mode-compat mode-compat--${compatibilityClass}`}>{preset.compatibility}</span>
                </div>
                <p className="mode-card__family">{preset.typeName}</p>
                <h3>{preset.name}</h3>
                <code>{preset.internalName}</code>
                <p className="mode-card__description">{preset.description}</p>
                <div className="mode-card__meta">
                  <span><Users size={13} />Up to {preset.maxPlayers}</span>
                  <span><small>TYPE</small>{preset.type}</span>
                  <span><small>MODE</small>{preset.mode}</span>
                </div>
                <div className="mode-card__actions">
                  <button className="button button--ghost" onClick={() => onStage(preset)} disabled={loading || isCurrent}>{isCurrent ? <><Check size={14} />Current values</> : <>Stage for next map <ChevronRight size={13} /></>}</button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mode-footnote"><CircleDot size={14} /><p><strong>Compatibility matters.</strong> Map-dependent modes need compatible map logic. Legacy definitions remain in the shipped CS2 file but may require removed content or extra flags.</p></div>
      </section>
    </div>
  );
}

interface ConsoleViewProps {
  entries: ConsoleEntry[];
  input: string;
  setInput: (value: string) => void;
  busy: boolean;
  search: string;
  setSearch: (value: string) => void;
  commands: ConsoleCommandOption[];
  completions: ConsoleCommandOption[];
  syncedCount: number;
  syncing: boolean;
  snapshot: ServerSnapshot;
  profile: ServerProfile;
  latency: number | null;
  demoMode: boolean;
  onSync: () => void;
  onSubmit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onUseCommand: (command: string) => void;
  onClear: () => void;
  onCopy: (value: string) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

function ConsoleView({ entries, input, setInput, busy, search, setSearch, commands, completions, syncedCount, syncing, snapshot, profile, latency, demoMode, onSync, onSubmit, onKeyDown, onUseCommand, onClear, onCopy, endRef }: ConsoleViewProps) {
  const [completionIndex, setCompletionIndex] = useState(0);
  const [completionVisible, setCompletionVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCompletionIndex = completions.length ? Math.min(completionIndex, completions.length - 1) : 0;
  const showCompletions = completionVisible && completions.length > 0;

  const updateInput = (value: string) => {
    setInput(value);
    setCompletionIndex(0);
    setCompletionVisible(true);
  };

  const completeCommand = (command: ConsoleCommandOption) => {
    setInput(`${command.name} `);
    setCompletionIndex(0);
    setCompletionVisible(false);
  };

  const selectCommand = (command: string) => {
    onUseCommand(command);
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.scrollIntoView({ block: "nearest" });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showCompletions && event.key === "Tab") {
      event.preventDefault();
      completeCommand(completions[activeCompletionIndex]);
      return;
    }
    if (showCompletions && event.key === "ArrowDown") {
      event.preventDefault();
      setCompletionIndex((index) => (index + 1) % completions.length);
      return;
    }
    if (showCompletions && event.key === "ArrowUp") {
      event.preventDefault();
      setCompletionIndex((index) => (index - 1 + completions.length) % completions.length);
      return;
    }
    if (showCompletions && event.key === "Escape") {
      event.preventDefault();
      setCompletionVisible(false);
      return;
    }
    onKeyDown(event);
  };

  return (
    <div className="console-layout">
      <section className="terminal terminal-panel panel" aria-label="Server console">
        <div className="terminal__header">
          <div className="terminal__dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="terminal__host">{profile.host}:{profile.port}</span>
          <button onClick={onClear} disabled={!entries.length}><Trash2 size={14} />Clear</button>
        </div>
        <div className="terminal-status">
          <span><MapIcon size={13} />{snapshot.map}</span>
          <span><Users size={13} />{snapshot.humans + snapshot.bots}{snapshot.maxPlayers ? ` / ${snapshot.maxPlayers}` : ""} players</span>
          <span>{latency !== null ? `${latency} ms` : "Awaiting response"}</span>
          {demoMode && <span className="terminal-status__demo">Sample server</span>}
        </div>
        <div className="terminal__body" role="log" aria-label="Console output" aria-live="polite" aria-relevant="additions text">
          {!entries.length && (
            <div className="terminal-welcome">
              <p>{demoMode ? "Demo console ready." : "Connected. Your console is ready."}</p>
              <span>Enter a command below. Try <button type="button" onClick={() => selectCommand("status")}>status</button> to inspect the server.</span>
            </div>
          )}
          {[...entries].reverse().map((entry) => (
            <div className={`terminal-entry terminal-entry--${entry.status}`} key={entry.id}>
              <div className="terminal-entry__command"><span>{formatClock(entry.timestamp)}</span><b>›</b><code>{entry.command}</code>{entry.status === "pending" && <LoaderCircle size={14} className="spin" />}</div>
              {entry.response && <div className="terminal-entry__response"><pre>{entry.response}</pre><button onClick={() => onCopy(entry.response)} aria-label="Copy response"><Copy size={13} /></button></div>}
              {entry.durationMs && <small>completed in {entry.durationMs} ms</small>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="terminal-input" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          {showCompletions && (
            <div className="command-completions" role="listbox" id="rcon-command-completions" aria-label="Command completions">
              <div className="command-completions__hint"><span>{completions.length} {completions.length === 1 ? "match" : "matches"}</span><span><kbd>↑</kbd><kbd>↓</kbd> select <kbd>Tab</kbd> complete</span></div>
              {completions.map((command, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeCompletionIndex}
                  className={index === activeCompletionIndex ? "is-active" : ""}
                  id={`rcon-completion-${index}`}
                  key={command.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => completeCommand(command)}
                >
                  <Command size={14} />
                  <span><code>{command.name}</code><small>{command.description}</small></span>
                  <em>{command.meta}</em>
                </button>
              ))}
            </div>
          )}
          <span>rcon</span><b>›</b><input ref={inputRef} role="combobox" autoComplete="off" spellCheck={false} value={input} onChange={(event) => updateInput(event.target.value)} onKeyDown={handleInputKeyDown} onFocus={() => setCompletionVisible(true)} onBlur={() => setCompletionVisible(false)} placeholder="Type a command…" aria-label="RCON command" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="rcon-command-completions" aria-expanded={showCompletions} aria-activedescendant={showCompletions ? `rcon-completion-${activeCompletionIndex}` : undefined} /><button type="submit" aria-label="Execute" disabled={!input.trim() || busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}<span>Execute</span></button>
        </form>
        <div className="terminal-hints"><span><kbd>↑</kbd><kbd>↓</kbd> command history</span><span><kbd>Tab</kbd> autocomplete</span><span>{demoMode ? "Demo responses" : "RCON over TCP"}</span></div>
      </section>

      <details className="command-browser command-reference">
        <summary className="command-browser__head"><h2>Command reference</h2><span>{syncedCount ? `${syncedCount.toLocaleString()} synced` : "Built-in commands"}</span><ChevronDown size={15} /></summary>
        <div className="search-field search-field--compact"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search commands" placeholder="Search commands" /></div>
        <button className="sync-card" onClick={onSync} disabled={syncing}><span><RefreshCw size={16} className={syncing ? "spin" : ""} /></span><span><strong>{syncedCount ? "Resync server catalogue" : "Sync every server command"}</strong><small>Runs cvarlist and saves results locally</small></span><ChevronRight size={15} /></button>
        <div className="command-list">
          {commands.map((command) => (
            <button key={command.name} onClick={() => selectCommand(command.syntax)}>
              <span><code>{command.name}</code><em>{command.meta}</em></span>
              <small>{command.description}</small>
            </button>
          ))}
          {!commands.length && <InlineEmpty icon={Command} title="No commands found" copy="Try a broader search." />}
        </div>
      </details>
    </div>
  );
}

interface SettingsViewProps {
  stored: StoredState;
  activeProfile: ServerProfile | null;
  connected: boolean;
  demoMode: boolean;
  onAdd: () => void;
  onSwitch: (profile: ServerProfile) => void;
  onDelete: (profile: ServerProfile) => void;
  onDisconnect: () => void;
  onRefreshChange: (seconds: number) => void;
  onExport: () => void;
  onClearData: () => void;
}

function SettingsView({ stored, activeProfile, connected, demoMode, onAdd, onSwitch, onDelete, onDisconnect, onRefreshChange, onExport, onClearData }: SettingsViewProps) {
  return (
    <div className="settings-grid">
      <section className="panel settings-section settings-section--wide">
        <PanelHeading eyebrow="Connections" title="Server profiles" action={<button className="button button--secondary" onClick={onAdd}><Plus size={15} />Add server</button>} />
        <div className="profile-list">
          {stored.profiles.map((profile) => {
            const active = !demoMode && activeProfile?.id === profile.id;
            return <div className={`profile-row ${active ? "is-active" : ""}`} key={profile.id}><span className="profile-row__icon"><Server size={17} /></span><span><strong>{profile.name}</strong><small>{profile.host}:{profile.port}</small></span>{active && <em><span className="pulse-dot" />{connected ? "Connected" : "Selected"}</em>}<button className="button button--tiny" onClick={() => onSwitch(profile)}>{active ? "Reconnect" : "Connect"}</button><button className="icon-button icon-button--danger" onClick={() => onDelete(profile)} aria-label={`Delete ${profile.name}`}><Trash2 size={15} /></button></div>;
          })}
          {!stored.profiles.length && <InlineEmpty icon={Server} title="No saved profiles" copy="Add a server or use the demo without saving anything." />}
        </div>
        {(activeProfile || demoMode) && <button className="text-button disconnect-link" onClick={onDisconnect}><Unplug size={14} />Disconnect current session</button>}
      </section>

      <section className="panel settings-section">
        <PanelHeading eyebrow="Status" title="Auto refresh" />
        <label className="select-label"><span>Polling interval<small>Only while this tab is visible</small></span><select value={stored.refreshSeconds} onChange={(event) => onRefreshChange(Number(event.target.value))}><option value={0}>Off</option><option value={10}>Every 10 seconds</option><option value={15}>Every 15 seconds</option><option value={30}>Every 30 seconds</option><option value={60}>Every minute</option></select></label>
      </section>

      <section className="panel settings-section">
        <PanelHeading eyebrow="Browser data" title="Local storage" />
        <div className="settings-stat"><HardDrive size={18} /><span><strong>{stored.profiles.length} profiles · {stored.consoleHistory.length} commands</strong><small>Stored only in this browser origin</small></span></div>
        <div className="button-row"><button className="button button--secondary" onClick={onExport}><Download size={15} />Export safe copy</button><button className="button button--danger-outline" onClick={onClearData}><Trash2 size={15} />Clear data</button></div>
      </section>

      <section className="panel security-card settings-section--wide">
        <span className="security-card__icon"><LockKeyhole size={21} /></span>
        <div><p className="eyebrow">Security model</p><h3>No cloud database. No server-side sessions.</h3><p>Profiles and history are saved in this browser. This app’s built-in connection service uses your RCON password in memory to talk to the game server. Passwords are saved on this device only when you choose. There is no account, separate worker, or database. Use an installation you trust.</p></div>
      </section>
    </div>
  );
}

function Modal({ children, onClose, labelledBy, wide = false, persistent = false }: { children: React.ReactNode; onClose: () => void; labelledBy: string; wide?: boolean; persistent?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="modal-layer" aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); if (!persistent) onClose(); }} onMouseDown={(event) => { if (!persistent && event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? "modal--wide" : ""}`}>
        {!persistent && <button className="icon-button modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>}
        {children}
      </section>
    </dialog>
  );
}
