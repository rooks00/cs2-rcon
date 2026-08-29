"use client";

import {
  Activity,
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Gamepad2,
  Gauge,
  Gavel,
  Globe2,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Network,
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
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  SquareTerminal,
  Star,
  Swords,
  Target,
  Trash2,
  TriangleAlert,
  Unplug,
  UserRoundX,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMAND_LIBRARY, DEFAULT_MAPS, GAME_MODE_PRESETS, getMapChangeCommand, quoteRcon, type GameModePreset } from "@/lib/commands";
import { DEMO_STATUS, executeDemoCommand } from "@/lib/demo";
import { enrichStatusWithJson, parseBanList, parseCvarList, parseIntegerCvar, parseMaps, parseStatus } from "@/lib/parsers";
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

type Section = "overview" | "players" | "bans" | "maps" | "modes" | "console" | "settings";
type Secrets = { password: string; relayKey: string };
type Toast = { id: string; message: string; tone: "success" | "error" | "info" };
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

const NAV_ITEMS: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "players", label: "Players", icon: Users },
  { id: "bans", label: "Ban list", icon: Gavel },
  { id: "maps", label: "Maps", icon: MapIcon },
  { id: "modes", label: "Game modes", icon: Swords },
  { id: "console", label: "Console", icon: SquareTerminal },
];

const SECTION_COPY: Record<Section, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "Control room", title: "Server overview", description: "Live health, players, and match controls." },
  players: { eyebrow: "Roster", title: "Connected players", description: "Inspect, kick, or ban the current roster." },
  bans: { eyebrow: "Moderation", title: "Ban list", description: "Steam and IP filters reported by the server." },
  maps: { eyebrow: "Rotation", title: "Server maps", description: "Browse installed maps and change level safely." },
  modes: { eyebrow: "Ruleset", title: "Game modes", description: "Manage the exact game_type and game_mode pair." },
  console: { eyebrow: "RCON", title: "Command console", description: "Run any command exposed by your CS2 server." },
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

export function RconDashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [stored, setStored] = useState<StoredState>(() => loadStoredState());
  const [section, setSection] = useState<Section>("overview");
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
  const [connectOpen, setConnectOpen] = useState(() => {
    const initial = loadStoredState();
    const profile = initial.profiles.find((item) => item.id === initial.activeProfileId);
    return !profile?.password;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    if (hydrated) saveStoredState(stored);
  }, [hydrated, stored]);

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
    for (let index = 0; index < commands.length; index += 50) {
      results.push(...await requestRcon(profile, auth, commands.slice(index, index + 50)));
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
    if (section === "console") terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      setSection("overview");
      notify(`Connected to ${profile.name}.`, "success");
    } catch (error) {
      setConnected(false);
      notify(error instanceof Error ? error.message : "Connection failed.", "error");
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [notify]);

  const saveAndConnect = useCallback(async (input: { id?: string; name: string; host: string; port: number; password: string; relayKey: string; rememberSecrets: boolean }) => {
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
      const [result] = await runCommands(["maps *"]);
      const parsed = parseMaps(result.response);
      if (parsed.length) setServerMaps(parsed);
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
    return serverMaps.filter((map) => !query || `${map.name} ${map.category}`.toLowerCase().includes(query));
  }, [mapSearch, serverMaps]);

  const filteredCommands = useMemo(() => {
    const query = consoleSearch.trim().toLowerCase();
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
    return [...merged.values()].filter((item) => !query || `${item.name} ${item.syntax} ${item.description} ${item.meta}`.toLowerCase().includes(query)).slice(0, 200);
  }, [consoleSearch, stored.syncedCommands]);

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
    setConnectOpen(true);
  };

  if (!hydrated) {
    return (
      <main className="boot-screen">
        <RelayLogo />
        <div className="boot-line"><span /></div>
        <p>Preparing local control surface</p>
      </main>
    );
  }

  const pageCopy = SECTION_COPY[section];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__top">
          <RelayLogo />
          <button className="icon-button sidebar__close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>

        <button className="server-switcher" onClick={() => setConnectOpen(true)}>
          <span className={`server-switcher__mark ${connected ? "is-online" : ""}`}><Server size={17} /></span>
          <span className="server-switcher__copy">
            <strong>{activeProfile?.name ?? "No server"}</strong>
            <small>{activeProfile ? `${activeProfile.host}:${activeProfile.port}` : "Add a connection"}</small>
          </span>
          <ChevronDown size={15} />
        </button>

        <nav className="main-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "is-active" : ""}
              onClick={() => {
                setSection(item.id);
                setMobileNavOpen(false);
                if (item.id === "modes" && connected) void refreshGameMode(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "players" && snapshot?.humans ? <em>{snapshot.humans}</em> : null}
              {item.id === "bans" && bans.length ? <em>{bans.length}</em> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <button className={section === "settings" ? "is-active" : ""} onClick={() => { setSection("settings"); setMobileNavOpen(false); }}>
            <Settings size={18} /><span>Settings</span>
          </button>
          <div className="storage-note">
            <HardDrive size={15} />
            <span><strong>Local only</strong><small>No account or database</small></span>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="topbar__titles">
            <span>{pageCopy.eyebrow}</span>
            <strong>{pageCopy.title}</strong>
          </div>
          <div className="topbar__actions">
            <div className={`connection-pill ${connected ? "is-online" : ""}`}>
              <span className="pulse-dot" />
              <span>{connected ? (demoMode ? "Demo session" : "RCON online") : "Disconnected"}</span>
            </div>
            <button className="icon-button" onClick={() => void refreshStatus()} disabled={!activeProfile || refreshing} aria-label="Refresh status">
              <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            </button>
            <button className="avatar-button" onClick={() => setSection("settings")} aria-label="Open settings">OP</button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{pageCopy.eyebrow}</p>
              <h1>{pageCopy.title}</h1>
              <p>{pageCopy.description}</p>
            </div>
            {activeProfile && (
              <div className="updated-copy">
                <Clock3 size={14} /> Updated {formatRelative(snapshot?.updatedAt)}
              </div>
            )}
          </div>

          {!connected && section !== "settings" ? (
            <DisconnectedState hasProfiles={stored.profiles.length > 0} onConnect={() => setConnectOpen(true)} onDemo={() => void connectProfile(DEMO_PROFILE, { password: "demo", relayKey: "" })} />
          ) : (
            <>
              {section === "overview" && snapshot && (
                <Overview
                  snapshot={snapshot}
                  profile={activeProfile!}
                  latency={lastLatency}
                  history={stored.consoleHistory}
                  broadcast={broadcast}
                  setBroadcast={setBroadcast}
                  onBroadcast={() => {
                    const message = broadcast.trim();
                    if (!message) return;
                    setBroadcast("");
                    void runQuick(`say ${quoteRcon(message)}`, "Message sent to the server.");
                  }}
                  onNavigate={setSection}
                  onRefresh={() => void refreshStatus()}
                  onQuick={(command, title, body, label) => confirmAction({
                    title,
                    body,
                    label,
                    tone: "warning",
                    action: async () => { await runQuick(command, `${title} command sent.`); },
                  })}
                />
              )}
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
                    title: `${map.workshopId ? "Host Workshop map" : "Change level"} to ${map.name}?`,
                    body: map.workshopId
                      ? `Relay identified Workshop item ${map.workshopId} from the server's installed-map path and will run host_workshop_map ${map.workshopId}. The current match will end while Steam mounts the map.`
                      : "The current match will end and every connected player will load the selected map using changelevel.",
                    label: map.workshopId ? "Host Workshop map" : "Change level",
                    tone: "warning",
                    action: async () => {
                      const command = getMapChangeCommand(map);
                      await runQuick(command, map.workshopId ? `Workshop map ${map.name} requested.` : `Changing level to ${map.name}.`);
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
              {section === "console" && (
                <ConsoleView
                  entries={stored.consoleHistory}
                  input={consoleInput}
                  setInput={setConsoleInput}
                  busy={consoleBusy}
                  search={consoleSearch}
                  setSearch={setConsoleSearch}
                  commands={filteredCommands}
                  syncedCount={stored.syncedCommands.length}
                  syncing={catalogLoading}
                  onSync={() => void syncCatalog()}
                  onSubmit={() => void executeConsole()}
                  onKeyDown={handleConsoleKeyDown}
                  onUseCommand={(command) => setConsoleInput(command)}
                  onClear={() => setStored((current) => ({ ...current, consoleHistory: [] }))}
                  onCopy={(value) => { void navigator.clipboard.writeText(value); notify("Copied to clipboard.", "success"); }}
                  endRef={terminalEndRef}
                />
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
        <ConnectModal
          profiles={stored.profiles}
          activeProfile={demoMode ? null : activeProfile}
          secrets={secrets}
          busy={connecting}
          canClose={Boolean(activeProfile)}
          onClose={() => setConnectOpen(false)}
          onSave={saveAndConnect}
          onDemo={() => void connectProfile(DEMO_PROFILE, { password: "demo", relayKey: "" })}
        />
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

function DisconnectedState({ hasProfiles, onConnect, onDemo }: { hasProfiles: boolean; onConnect: () => void; onDemo: () => void }) {
  return (
    <section className="empty-stage panel">
      <div className="empty-stage__visual">
        <div className="radar-ring radar-ring--one" />
        <div className="radar-ring radar-ring--two" />
        <div className="radar-cross radar-cross--h" />
        <div className="radar-cross radar-cross--v" />
        <div className="radar-server"><Unplug size={27} /></div>
      </div>
      <p className="eyebrow">RCON link offline</p>
      <h2>{hasProfiles ? "Reconnect your server" : "Connect your first CS2 server"}</h2>
      <p>Relay keeps its state in this browser and sends commands through a short-lived, stateless TCP relay.</p>
      <div className="empty-stage__actions">
        <button className="button button--primary" onClick={onConnect}><Plus size={16} />{hasProfiles ? "Choose server" : "Add server"}</button>
        <button className="button button--ghost" onClick={onDemo}><Sparkles size={16} />Explore demo</button>
      </div>
      <div className="trust-row">
        <span><HardDrive size={14} />Browser storage</span>
        <span><Database size={14} />No database</span>
        <span><ShieldCheck size={14} />Stateless relay</span>
      </div>
    </section>
  );
}

interface OverviewProps {
  snapshot: ServerSnapshot;
  profile: ServerProfile;
  latency: number | null;
  history: ConsoleEntry[];
  broadcast: string;
  setBroadcast: (value: string) => void;
  onBroadcast: () => void;
  onNavigate: (section: Section) => void;
  onRefresh: () => void;
  onQuick: (command: string, title: string, body: string, label: string) => void;
}

function Overview({ snapshot, profile, latency, history, broadcast, setBroadcast, onBroadcast, onNavigate, onRefresh, onQuick }: OverviewProps) {
  const occupancy = snapshot.maxPlayers ? Math.min(100, Math.round(((snapshot.humans + snapshot.bots) / snapshot.maxPlayers) * 100)) : 0;
  return (
    <div className="dashboard-grid">
      <section className="server-hero panel">
        <div className="server-hero__noise" />
        <div className="server-hero__head">
          <div className="live-label"><span className="pulse-dot" /> Live server</div>
          <button className="icon-button icon-button--soft" onClick={onRefresh} aria-label="Refresh server"><RefreshCw size={16} /></button>
        </div>
        <div className="server-hero__content">
          <div className="server-emblem"><span>R</span><i /></div>
          <div>
            <h2>{snapshot.hostname}</h2>
            <p><Globe2 size={14} />{profile.host}:{profile.port}</p>
          </div>
        </div>
        <div className="server-hero__footer">
          <span><MapIcon size={15} /><small>Current map</small><strong>{snapshot.map}</strong></span>
          <span><Activity size={15} /><small>Build</small><strong>{snapshot.version.split(/\s+/)[0] || "CS2"}</strong></span>
          <span>{snapshot.secure === false ? <ShieldOff size={15} /> : <Shield size={15} />}<small>VAC</small><strong>{snapshot.secure === false ? "Insecure" : snapshot.secure ? "Secure" : "Unknown"}</strong></span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon={Users} label="Players" value={`${snapshot.humans + snapshot.bots}`} suffix={snapshot.maxPlayers ? `/ ${snapshot.maxPlayers}` : "online"} detail={`${snapshot.humans} humans · ${snapshot.bots} bots`} tone="orange" progress={occupancy} />
        <MetricCard icon={Gauge} label="RCON response" value={latency ? `${latency}` : "—"} suffix={latency ? "ms" : "waiting"} detail={latency && latency < 350 ? "Healthy connection" : "Last command round trip"} tone="green" />
        <MetricCard icon={Network} label="Platform" value={snapshot.os || "Server"} suffix="" detail="Dedicated · Source 2 RCON" tone="blue" />
      </section>

      <section className="panel roster-panel">
        <PanelHeading eyebrow="Live roster" title="Players in server" action={<button className="text-button" onClick={() => onNavigate("players")}>View all <ChevronRight size={14} /></button>} />
        {snapshot.players.length ? (
          <div className="mini-roster">
            {snapshot.players.slice(0, 5).map((player) => (
              <div key={`${player.userId}-${player.steamId}`}>
                <span className="player-avatar" style={{ "--avatar-hue": avatarHue(player.name) } as React.CSSProperties}>{player.isBot ? <Bot size={16} /> : initials(player.name)}</span>
                <span className="mini-roster__name"><strong>{player.name}</strong><small>{player.isBot ? "BOT" : player.steamId || "Steam ID unavailable"}</small></span>
                <span className={`ping ${player.ping && player.ping > 80 ? "ping--high" : ""}`}><i />{player.ping ?? "—"} ms</span>
              </div>
            ))}
          </div>
        ) : <InlineEmpty icon={Users} title="No players connected" copy="The server is ready for its next match." />}
      </section>

      <section className="panel quick-panel">
        <PanelHeading eyebrow="Match control" title="Quick actions" />
        <div className="quick-grid">
          <button onClick={() => onQuick("mp_restartgame 1", "Restart match", "The match will restart after one second and current round progress will reset.", "Restart match")}><span><RotateCcw size={18} /></span><strong>Restart match</strong><small>1 second delay</small></button>
          <button onClick={() => onQuick("mp_warmup_end", "End warmup", "Warmup will end immediately and the configured match flow will continue.", "End warmup")}><span><Play size={18} /></span><strong>End warmup</strong><small>Go live now</small></button>
          <button onClick={() => onQuick("mp_pause_match", "Pause match", "The match will pause using CS2's server-side match pause command.", "Pause match")}><span><Pause size={18} /></span><strong>Pause match</strong><small>Server pause</small></button>
          <button onClick={() => onNavigate("maps")}><span><MapIcon size={18} /></span><strong>Change map</strong><small>Open rotation</small></button>
        </div>
        <form className="broadcast-box" onSubmit={(event) => { event.preventDefault(); onBroadcast(); }}>
          <MessageSquare size={16} />
          <input value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder="Broadcast a message to everyone…" maxLength={240} />
          <button type="submit" disabled={!broadcast.trim()}><Send size={15} /><span>Send</span></button>
        </form>
      </section>

      <section className="panel activity-panel">
        <PanelHeading eyebrow="Local audit" title="Recent commands" action={<button className="text-button" onClick={() => onNavigate("console")}>Open console <ChevronRight size={14} /></button>} />
        {history.length ? (
          <div className="activity-list">
            {history.slice(0, 5).map((entry) => (
              <div key={entry.id}>
                <span className={`activity-icon activity-icon--${entry.status}`}>{entry.status === "success" ? <Check size={14} /> : entry.status === "error" ? <X size={14} /> : <LoaderCircle size={14} className="spin" />}</span>
                <span><code>{entry.command}</code><small>{formatClock(entry.timestamp)}{entry.durationMs ? ` · ${entry.durationMs} ms` : ""}</small></span>
              </div>
            ))}
          </div>
        ) : <InlineEmpty icon={Command} title="No commands yet" copy="Quick actions and console commands appear here." />}
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, suffix, detail, tone, progress }: { icon: LucideIcon; label: string; value: string; suffix: string; detail: string; tone: string; progress?: number }) {
  return (
    <div className={`metric-card panel metric-card--${tone}`}>
      <span className="metric-card__icon"><Icon size={18} /></span>
      <p>{label}</p>
      <div><strong>{value}</strong><span>{suffix}</span></div>
      <small>{detail}</small>
      {typeof progress === "number" && <div className="progress"><i style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="panel-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
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
        <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, Steam ID, or address" /><kbd>⌘ K</kbd></div>
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
                <td><div className="row-actions"><button className="icon-button icon-button--soft" onClick={() => onKick(player)} title="Kick player"><UserRoundX size={16} /></button><button className="icon-button icon-button--danger" onClick={() => onBan(player)} disabled={player.isBot || !player.steamId} title={player.steamId ? "Ban player" : "Steam ID was not exposed by this CS2 server"}><Ban size={16} /></button></div></td>
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
          <div className="search-field search-field--compact"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ban list" /></div>
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
  const sorted = [...maps].sort((a, b) => Number(favorites.includes(b.name)) - Number(favorites.includes(a.name)) || a.name.localeCompare(b.name));
  return (
    <div className="stack-lg">
      <section className="map-current panel">
        <div className="map-current__art"><span /><i>/{currentMap.replace(/^(de|cs)_/, "")}</i></div>
        <div><p className="eyebrow">Now playing</p><h2>{currentMap}</h2><p><Radio size={14} />Active on the live server</p></div>
        <div className="map-current__lines"><span /><span /><span /></div>
      </section>
      <section className="panel maps-panel">
        <div className="data-toolbar">
          <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search installed maps" /></div>
          <div className="toolbar-spacer" />
          <span className="record-count">{maps.length} of {total}</span>
          <button className="button button--secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />Sync server maps</button>
        </div>
        <div className="map-grid">
          {sorted.map((map, index) => {
            const isCurrent = map.name === currentMap;
            const isFavorite = favorites.includes(map.name);
            return (
              <article className={`map-card map-card--${(index % 5) + 1} ${isCurrent ? "is-current" : ""}`} key={`${map.workshopId ?? "stock"}-${map.name}`}>
                <div className="map-card__visual"><span>{map.name.slice(0, 2).toUpperCase()}</span><i /><b /></div>
                <div className="map-card__body">
                  <span className="map-card__category">{map.category}{map.workshopId ? ` · #${map.workshopId}` : ""}</span>
                  <button className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} onClick={() => onFavorite(map.name)} aria-label={`${isFavorite ? "Remove" : "Add"} ${map.name} ${isFavorite ? "from" : "to"} favorites`}><Star size={15} fill={isFavorite ? "currentColor" : "none"} /></button>
                  <h3>{map.name}</h3>
                  <button className={`button ${isCurrent ? "button--current" : "button--tiny"}`} onClick={() => !isCurrent && onChange(map)} disabled={isCurrent}>{isCurrent ? <><Radio size={13} />Current</> : <>{map.workshopId ? "Host Workshop map" : "Change level"} <ChevronRight size={13} /></>}</button>
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
        <div className="workshop-input"><input inputMode="numeric" value={workshopId} onChange={(event) => setWorkshopId(event.target.value.replace(/\D/g, ""))} placeholder="3121800508" maxLength={15} /><button className="button button--primary" onClick={onWorkshop} disabled={!workshopId}>Load map</button></div>
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
  commands: Array<{ name: string; syntax: string; description: string; meta: string }>;
  syncedCount: number;
  syncing: boolean;
  onSync: () => void;
  onSubmit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onUseCommand: (command: string) => void;
  onClear: () => void;
  onCopy: (value: string) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

function ConsoleView({ entries, input, setInput, busy, search, setSearch, commands, syncedCount, syncing, onSync, onSubmit, onKeyDown, onUseCommand, onClear, onCopy, endRef }: ConsoleViewProps) {
  return (
    <div className="console-layout">
      <section className="terminal panel">
        <div className="terminal__bar">
          <div className="terminal-dots"><i /><i /><i /></div>
          <span><SquareTerminal size={15} />rcon://live-session</span>
          <button onClick={onClear} disabled={!entries.length}><Trash2 size={14} />Clear</button>
        </div>
        <div className="terminal__output">
          {!entries.length && (
            <div className="terminal-welcome">
              <RelayLogo compact />
              <p>Authenticated console ready.</p>
              <span>Run any vanilla, ConVar, CounterStrikeSharp, or plugin command.</span>
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
        <form className="terminal__input" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <span>rcon</span><b>›</b><input autoComplete="off" spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} placeholder="Type a command…" aria-label="RCON command" /><button type="submit" disabled={!input.trim() || busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}<span>Execute</span></button>
        </form>
      </section>

      <aside className="command-browser panel">
        <div className="command-browser__head"><div><p className="eyebrow">Reference</p><h2>Commands</h2></div><span>{syncedCount ? `${syncedCount.toLocaleString()} synced` : "Built-ins"}</span></div>
        <div className="search-field search-field--compact"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search commands" /></div>
        <button className="sync-card" onClick={onSync} disabled={syncing}><span><RefreshCw size={16} className={syncing ? "spin" : ""} /></span><span><strong>{syncedCount ? "Resync server catalogue" : "Sync every server command"}</strong><small>Runs cvarlist and saves results locally</small></span><ChevronRight size={15} /></button>
        <div className="command-list">
          {commands.map((command) => (
            <button key={command.name} onClick={() => onUseCommand(command.syntax)}>
              <span><code>{command.name}</code><em>{command.meta}</em></span>
              <small>{command.description}</small>
            </button>
          ))}
          {!commands.length && <InlineEmpty icon={Command} title="No commands found" copy="Try a broader search." />}
        </div>
      </aside>
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
        <div><p className="eyebrow">Security model</p><h3>No cloud database. No server-side sessions.</h3><p>Profiles and history live in <code>localStorage</code>. Each command sends the target and RCON password to your own short-lived Vercel function, which opens a TCP connection, returns the response, and discards the credentials. Use a relay key and a host allowlist in production.</p></div>
      </section>
    </div>
  );
}

interface ConnectModalProps {
  profiles: ServerProfile[];
  activeProfile: ServerProfile | null;
  secrets: Secrets;
  busy: boolean;
  canClose: boolean;
  onClose: () => void;
  onSave: (input: { id?: string; name: string; host: string; port: number; password: string; relayKey: string; rememberSecrets: boolean }) => Promise<void>;
  onDemo: () => void;
}

function ConnectModal({ profiles, activeProfile, secrets, busy, canClose, onClose, onSave, onDemo }: ConnectModalProps) {
  const [name, setName] = useState(activeProfile?.name ?? "");
  const [host, setHost] = useState(activeProfile?.host ?? "");
  const [port, setPort] = useState(String(activeProfile?.port ?? 27015));
  const [password, setPassword] = useState(secrets.password || activeProfile?.password || "");
  const [relayKey, setRelayKey] = useState(secrets.relayKey || activeProfile?.relayKey || "");
  const [remember, setRemember] = useState(activeProfile?.rememberSecrets ?? false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(activeProfile?.id);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({ id: editingId, name, host, port: Number(port), password, relayKey, rememberSecrets: remember }).catch(() => undefined);
  };

  const chooseNew = () => {
    setEditingId(undefined); setName(""); setHost(""); setPort("27015"); setPassword(""); setRelayKey(""); setRemember(false);
  };

  const chooseProfile = (profile: ServerProfile) => {
    setEditingId(profile.id);
    setName(profile.name);
    setHost(profile.host);
    setPort(String(profile.port));
    setPassword(profile.password ?? "");
    setRelayKey(profile.relayKey ?? "");
    setRemember(profile.rememberSecrets);
  };

  return (
    <Modal onClose={() => canClose && !busy && onClose()} labelledBy="connect-title" wide persistent={!canClose}>
      <div className="connect-modal__header">
        <span className="connect-mark"><Radio size={21} /></span>
        <div><p className="eyebrow">Secure relay</p><h2 id="connect-title">Connect a CS2 server</h2><p>Credentials go directly to your deployment for this request.</p></div>
      </div>
      {profiles.length > 0 && (
        <div className="profile-chips">
          {profiles.map((profile) => <button key={profile.id} className={editingId === profile.id ? "is-active" : ""} onClick={() => chooseProfile(profile)} disabled={busy}><Server size={14} />{profile.name}</button>)}
          <button className={!editingId ? "is-active" : ""} onClick={chooseNew} disabled={busy}><Plus size={14} />New</button>
        </div>
      )}
      <form className="connect-form" onSubmit={(event) => void submit(event)}>
        <div className="field-row">
          <label className="field"><span>Profile name</span><div><Server size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Match server EU" maxLength={60} /></div></label>
          <label className="field field--port"><span>Port</span><div><Network size={16} /><input type="number" min={1} max={65535} value={port} onChange={(event) => setPort(event.target.value)} required /></div></label>
        </div>
        <label className="field"><span>Public hostname or IP</span><div><Globe2 size={16} /><input value={host} onChange={(event) => setHost(event.target.value)} placeholder="cs2.example.com" autoCapitalize="none" autoCorrect="off" required /></div><small>Use the public address reachable from Vercel, without <code>http://</code>.</small></label>
        <label className="field"><span>RCON password</span><div><KeyRound size={16} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your server's rcon_password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label className="field"><span>Relay access key <em>Deployment secret</em></span><div><LockKeyhole size={16} /><input type="password" value={relayKey} onChange={(event) => setRelayKey(event.target.value)} placeholder="Matches RCON_RELAY_SECRET" /></div><small>Required on Vercel; optional during local development.</small></label>
        <label className="check-field"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span><i><Check size={12} /></i><strong>Remember secrets on this device</strong><small>Stores the RCON password and relay key in this browser&apos;s localStorage.</small></span></label>
        <div className="connect-note"><ShieldCheck size={16} /><span><strong>Nothing is written to a server database.</strong> Vercel function logs should also remain free of request bodies.</span></div>
        <button className="button button--primary button--large" type="submit" disabled={busy || !host.trim() || !password || !Number(port)}>{busy ? <LoaderCircle size={17} className="spin" /> : <Wifi size={17} />}{busy ? "Testing connection…" : "Connect & verify"}</button>
      </form>
      <div className="demo-divider"><span>or preview without a server</span></div>
      <button className="demo-button" onClick={onDemo} disabled={busy}><Sparkles size={16} /><span><strong>Explore the interactive demo</strong><small>Uses realistic local sample data</small></span><ChevronRight size={16} /></button>
    </Modal>
  );
}

function Modal({ children, onClose, labelledBy, wide = false, persistent = false }: { children: React.ReactNode; onClose: () => void; labelledBy: string; wide?: boolean; persistent?: boolean }) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (!persistent && event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {!persistent && <button className="icon-button modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>}
        {children}
      </section>
    </div>
  );
}
