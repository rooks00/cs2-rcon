"use client";

import { ArrowRight, Braces, Check, ChevronRight, Eye, EyeOff, FileJson, Globe2, KeyRound, LoaderCircle, LockKeyhole, Monitor, Server, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { EXAMPLE_CONNECTION_JSON, parseConnectionJson, parseServerAddress, type ConnectionDetails } from "@/lib/connection-import";
import type { ServerProfile } from "@/lib/types";
import { HelperLauncher } from "@/components/helper-launcher";
import { disconnectBrowserHelper, fetchRcon, hasBrowserHelper, getKnownLocalHelper, helperWebsiteOrigin, rememberLocalHelper, type LocalHelperMetadata } from "@/lib/helper-install";

export interface ConnectionInput extends ConnectionDetails {
  id?: string;
  relayKey: string;
  rememberSecrets: boolean;
}

export interface ConnectionPanelProps {
  profiles: ServerProfile[];
  activeProfile: ServerProfile | null;
  secrets: { password: string; relayKey: string };
  busy: boolean;
  onSave: (input: ConnectionInput) => Promise<void>;
  onDemo: () => void;
}

type EntryTab = "details" | "json";
type Capabilities =
  | { status: "loading" }
  | { status: "ready"; requiresAccessKey: boolean; transport: "integrated-tcp" | "local-tcp" }
  | { status: "error"; message: string };

export function ConnectionPanel({ profiles, activeProfile, secrets, busy, onSave, onDemo }: ConnectionPanelProps) {
  const [name, setName] = useState(activeProfile?.name ?? "");
  const [host, setHost] = useState(activeProfile?.host ?? "");
  const [port, setPort] = useState(String(activeProfile?.port ?? 27015));
  const [password, setPassword] = useState(activeProfile ? secrets.password || activeProfile.password || "" : "");
  const [relayKey, setRelayKey] = useState(secrets.relayKey || activeProfile?.relayKey || "");
  const [remember, setRemember] = useState(activeProfile?.rememberSecrets ?? false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState(activeProfile?.id);
  const [tab, setTab] = useState<EntryTab>("details");
  const [json, setJson] = useState("");
  const [imported, setImported] = useState<ConnectionDetails[]>([]);
  const [error, setError] = useState("");
  const [errorTab, setErrorTab] = useState<EntryTab>("details");
  const [importNote, setImportNote] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities>({ status: "loading" });
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  const [keyRequiredByServer, setKeyRequiredByServer] = useState(false);
  const [mode, setMode] = useState<"hosted" | "device">("hosted");
  const [localHelper, setLocalHelper] = useState<LocalHelperMetadata | null>(getKnownLocalHelper);
  const [helperUnavailable, setHelperUnavailable] = useState(false);
  const hostRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const detailsTabId = `${id}-details-tab`;
  const jsonTabId = `${id}-json-tab`;
  const detailsPanelId = `${id}-details-panel`;
  const jsonPanelId = `${id}-json-panel`;
  const jsonInputId = `${id}-json-input`;
  const keyHintId = `${id}-key-hint`;
  const usingLocalHelper = localHelper !== null;
  const selectedMode = usingLocalHelper ? "device" : mode;
  const showConnectionForm = usingLocalHelper || mode === "hosted";
  const requiresKey = !usingLocalHelper && (keyRequiredByServer || (capabilities.status === "ready" && capabilities.requiresAccessKey));

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 5_000);

    const readCapabilities = async () => {
      try {
        const response = await fetchRcon({ cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("The installation settings could not be checked.");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The installation returned invalid settings.");
        const settings = value as Record<string, unknown>;
        if (settings.ok !== true || typeof settings.requiresAccessKey !== "boolean" || (settings.transport !== "integrated-tcp" && settings.transport !== "local-tcp")) {
          throw new Error("The installation returned invalid settings.");
        }
        const site = helperWebsiteOrigin(settings.hostedSite);
        if (settings.transport === "local-tcp" && !site) throw new Error("The local helper did not identify its hosted website.");
        if (disposed) return;

        setCapabilities({ status: "ready", requiresAccessKey: settings.requiresAccessKey, transport: settings.transport });
        if (settings.transport === "local-tcp" && site) {
          const helper = { site, version: typeof settings.helperVersion === "string" ? settings.helperVersion : "" };
          rememberLocalHelper(helper);
          setLocalHelper(helper);
          setHelperUnavailable(false);
        } else if (getKnownLocalHelper()) {
          // Preserve the known local route if a stopped helper is no longer serving its API.
          setHelperUnavailable(true);
        }
      } catch (issue) {
        if (disposed) return;
        setCapabilities({ status: "error", message: timedOut ? "The installation check timed out." : issue instanceof Error ? issue.message : "The installation settings could not be checked." });
        if (getKnownLocalHelper()) setHelperUnavailable(true);
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void readCapabilities();
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [capabilityAttempt]);

  const retryCapabilities = () => {
    setCapabilities({ status: "loading" });
    setCapabilityAttempt((attempt) => attempt + 1);
  };

  const fillDetails = (detail: ConnectionDetails) => {
    setName(detail.name); setHost(detail.host); setPort(String(detail.port)); setPassword(detail.password);
    setEditingId(undefined); setRemember(false); setShowPassword(false); setError(""); setTab("details");
    setImported([]); setImportNote("Details imported. Review them, then connect.");
    requestAnimationFrame(() => hostRef.current?.focus());
  };

  const reviewJson = () => {
    try {
      const values = parseConnectionJson(json);
      setError("");
      if (values.length === 1) fillDetails(values[0]);
      else setImported(values);
    } catch (issue) {
      setErrorTab("json");
      setError(issue instanceof Error ? issue.message : "Unable to read this JSON.");
    }
  };

  const chooseProfile = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    setEditingId(profile?.id); setName(profile?.name ?? ""); setHost(profile?.host ?? "");
    setPort(String(profile?.port ?? 27015)); setPassword(profile?.password ?? "");
    setRelayKey(profile?.relayKey ?? ""); setRemember(profile?.rememberSecrets ?? false);
    setError(""); setImportNote(""); setShowPassword(false);
  };

  const selectMode = (nextMode: "hosted" | "device") => {
    if (busy) return;
    if (usingLocalHelper && nextMode === "hosted") {
      if (hasBrowserHelper()) {
        disconnectBrowserHelper();
        setLocalHelper(null);
        setHelperUnavailable(false);
        setMode("hosted");
        retryCapabilities();
        return;
      }
      // The legacy loopback workspace returns to its configured website.
      window.location.assign(localHelper.site);
      return;
    }
    setMode(nextMode);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "details" : event.key === "End" ? "json" : tab === "details" ? "json" : "details";
    setTab(next);
    document.getElementById(next === "details" ? detailsTabId : jsonTabId)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !showConnectionForm) return;
    if (tab === "json") { reviewJson(); return; }
    setError("");
    try {
      const address = parseServerAddress(host, Number(port));
      if (!password) throw new Error("Enter the RCON password from your server configuration.");
      if (requiresKey && !relayKey) throw new Error("Enter the installation access key provided by its owner.");
      await onSave({ id: editingId, name, ...address, password, relayKey: usingLocalHelper ? "" : relayKey, rememberSecrets: remember });
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : "Connection failed. Check the server details and try again.";
      if (!usingLocalHelper && message.includes("installation is private")) setKeyRequiredByServer(true);
      setErrorTab("details");
      setError(message);
    }
  };

  const keyHint = requiresKey
    ? "Required by this installation’s owner."
    : capabilities.status === "loading"
      ? "Checking access requirements. Enter a key if you have one."
      : capabilities.status === "error"
        ? "Could not check access. Enter a key if you have one."
        : "Leave blank if you were not given a key.";

  return (
    <div className="connection-panel connection-panel--modes" data-capabilities-state={capabilities.status}>
      <div className="connection-mode-switch" role="group" aria-label="Connection method">
        <button type="button" aria-pressed={selectedMode === "hosted"} disabled={busy} onClick={() => selectMode("hosted")} title={localHelper ? `Open ${localHelper.site}` : undefined}><Globe2 size={15} />Hosted connection</button>
        <button type="button" aria-pressed={selectedMode === "device"} disabled={busy} onClick={() => selectMode("device")}><Monitor size={15} />Use this device</button>
      </div>

      <div className="connection-mode-body">
        <div className="connection-mode-panel" data-active={showConnectionForm} aria-hidden={!showConnectionForm} inert={!showConnectionForm}>
          <div className="connection-panel__title"><span><Server size={19} /></span><div><h2>Connect a server</h2></div></div>
          {localHelper && <p className={`connection-local-status ${helperUnavailable ? "connection-local-status--error" : ""}`} role="status">{helperUnavailable ? <TriangleAlert size={14} /> : <Check size={14} />}<span>{helperUnavailable ? "Restart the helper command, or choose Hosted connection to open the website." : capabilities.status === "loading" ? "Checking the local helper…" : "Local helper connected. RCON stays on this device."}</span></p>}

          <div className="connection-tabs" role="tablist" aria-label="Enter connection details">
            <button type="button" id={detailsTabId} role="tab" aria-selected={tab === "details"} aria-controls={detailsPanelId} tabIndex={tab === "details" ? 0 : -1} className={tab === "details" ? "is-active" : ""} onClick={() => setTab("details")} onKeyDown={handleTabKeyDown} disabled={busy}><Server size={14} />Server details</button>
            <button type="button" id={jsonTabId} role="tab" aria-selected={tab === "json"} aria-controls={jsonPanelId} tabIndex={tab === "json" ? 0 : -1} className={tab === "json" ? "is-active" : ""} onClick={() => setTab("json")} onKeyDown={handleTabKeyDown} disabled={busy}><Braces size={15} />Paste JSON</button>
          </div>

          <form className="connect-form" onSubmit={(event) => void submit(event)}>
            <div className="connection-entry-panels">
              <fieldset className="connection-entry-panel" id={detailsPanelId} role="tabpanel" aria-labelledby={detailsTabId} aria-hidden={tab !== "details"} inert={tab !== "details"} data-active={tab === "details"} disabled={busy || !showConnectionForm || tab !== "details"}>
                {profiles.length > 0 && <label className="field"><span>Saved server</span><select value={editingId ?? ""} onChange={(event) => chooseProfile(event.target.value)}><option value="">New connection</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
                <div className="field-row">
                  <label className="field"><span>Server address</span><div><Globe2 size={16} /><input ref={hostRef} value={host} onChange={(event) => setHost(event.target.value)} placeholder="cs2.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required /></div></label>
                  <label className="field field--port"><span>Port</span><div><input type="number" min={1} max={65535} step={1} value={port} onChange={(event) => setPort(event.target.value)} required /></div></label>
                </div>
                <label className="field"><span>RCON password</span><div><KeyRound size={16} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your server’s RCON password" autoComplete="off" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
                <label className="field"><span>Profile name <em>Optional</em></span><div><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Match server" maxLength={60} /></div></label>
                {importNote && <p className="import-success" role="status"><Check size={14} />{importNote}</p>}
                {error && errorTab === "details" && <div className="connection-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
              </fieldset>

              <fieldset className="connection-entry-panel" id={jsonPanelId} role="tabpanel" aria-labelledby={jsonTabId} aria-hidden={tab !== "json"} inert={tab !== "json"} data-active={tab === "json"} disabled={busy || !showConnectionForm || tab !== "json"}>
                <div className="json-import">
                  <div className="json-import__label"><label htmlFor={jsonInputId}>Server configuration</label><button type="button" className="text-button" onClick={() => { setJson(EXAMPLE_CONNECTION_JSON); setError(""); setImported([]); }}>Use example</button></div>
                  <textarea id={jsonInputId} aria-describedby={`${id}-json-help`} value={json} onChange={(event) => { setJson(event.target.value); setImported([]); setError(""); }} placeholder={EXAMPLE_CONNECTION_JSON} autoComplete="off" spellCheck={false} maxLength={100001} rows={7} required />
                  <p id={`${id}-json-help`}>Paste a server object, an array, or a settings export. We recognize <code>host</code>, <code>ip</code>, <code>rcon_port</code> and <code>rcon_password</code>, too.</p>
                  {imported.length > 0 && <div className="import-choices"><p>Choose a server to review</p>{imported.map((detail, index) => <button type="button" key={index} onClick={() => fillDetails(detail)}><Server size={16} /><span><strong>{detail.name || detail.host}</strong><small>{detail.host}:{detail.port}</small></span><ChevronRight size={16} /></button>)}</div>}
                </div>
                {error && errorTab === "json" && <div className="connection-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
              </fieldset>
            </div>

            <fieldset className="connection-shared-fields" disabled={busy || !showConnectionForm}>
              {!usingLocalHelper && <label className="field connection-access-key"><span>Installation access key <em>{requiresKey ? "Required" : "Optional"}</em></span><div><LockKeyhole size={16} /><input type="password" value={relayKey} onChange={(event) => setRelayKey(event.target.value)} autoComplete="off" placeholder="Key provided by the installation owner" aria-describedby={keyHintId} required={tab === "details" && requiresKey} /></div><small className="connection-access-key__hint" id={keyHintId}><span>{keyHint}</span>{capabilities.status === "error" && <button type="button" className="connection-capability-retry" onClick={retryCapabilities}>Retry</button>}</small></label>}
              <label className="remember-field"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember password on this device</span></label>
              {remember && <p className="field-hint">Saved in this browser without encryption. Use a trusted device.</p>}
              <button className="button button--primary button--large connect-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" />Connecting to server…</> : <><span>{tab === "json" ? "Review connection" : "Connect server"}</span>{tab === "json" ? <FileJson size={17} /> : <ArrowRight size={18} />}</>}</button>
            </fieldset>
          </form>

          <p className="connection-privacy"><ShieldCheck size={14} /><span>{usingLocalHelper ? "RCON connects from this computer. Saved only if you choose." : "Used by this app to connect. Saved only if you choose."}</span></p>
          <div className="connection-demo"><span>Just looking around?</span><button className="text-button" onClick={onDemo} disabled={busy}><Sparkles size={14} />Explore demo<ArrowRight size={14} /></button></div>
        </div>

        {!usingLocalHelper && <div className="connection-mode-panel" data-active={!showConnectionForm} aria-hidden={showConnectionForm} inert={showConnectionForm}><HelperLauncher onPaired={(helper) => { setLocalHelper(helper); setHelperUnavailable(false); retryCapabilities(); }} /></div>}
      </div>
    </div>
  );
}
