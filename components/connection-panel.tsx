"use client";

import { ArrowRight, Braces, Check, ChevronRight, Eye, EyeOff, FileJson, Globe2, KeyRound, LoaderCircle, LockKeyhole, Plus, Server, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EXAMPLE_CONNECTION_JSON, parseConnectionJson, parseServerAddress, type ConnectionDetails } from "@/lib/connection-import";
import type { ServerProfile } from "@/lib/types";

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

export function ConnectionPanel({ profiles, activeProfile, secrets, busy, onSave, onDemo }: ConnectionPanelProps) {
  const [name, setName] = useState(activeProfile?.name ?? "");
  const [host, setHost] = useState(activeProfile?.host ?? "");
  const [port, setPort] = useState(String(activeProfile?.port ?? 27015));
  const [password, setPassword] = useState(activeProfile ? secrets.password || activeProfile.password || "" : "");
  const [relayKey, setRelayKey] = useState(secrets.relayKey || activeProfile?.relayKey || "");
  const [remember, setRemember] = useState(activeProfile?.rememberSecrets ?? false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState(activeProfile?.id);
  const [tab, setTab] = useState<"details" | "json">("details");
  const [json, setJson] = useState("");
  const [imported, setImported] = useState<ConnectionDetails[]>([]);
  const [error, setError] = useState("");
  const [importNote, setImportNote] = useState("");
  const [requiresKey, setRequiresKey] = useState(false);
  const hostRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rcon", { cache: "no-store", signal: controller.signal }).then((response) => response.json())
      .then((value) => setRequiresKey(value.requiresAccessKey === true)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const fillDetails = (detail: ConnectionDetails) => {
    setName(detail.name); setHost(detail.host); setPort(String(detail.port)); setPassword(detail.password);
    setEditingId(undefined); setRemember(false); setShowPassword(false); setError(""); setTab("details");
    setJson(""); setImported([]); setImportNote("Details imported. Review them, then connect.");
    requestAnimationFrame(() => hostRef.current?.focus());
  };

  const reviewJson = () => {
    try {
      const values = parseConnectionJson(json);
      setError("");
      if (values.length === 1) fillDetails(values[0]);
      else setImported(values);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to read this JSON."); }
  };

  const chooseProfile = (id: string) => {
    const profile = profiles.find((item) => item.id === id);
    setEditingId(profile?.id); setName(profile?.name ?? ""); setHost(profile?.host ?? "");
    setPort(String(profile?.port ?? 27015)); setPassword(profile?.password ?? "");
    setRelayKey(profile?.relayKey ?? ""); setRemember(profile?.rememberSecrets ?? false);
    setError(""); setImportNote(""); setShowPassword(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (tab === "json") { reviewJson(); return; }
    setError("");
    try {
      const address = parseServerAddress(host, Number(port));
      if (!password) throw new Error("Enter the RCON password from your server configuration.");
      await onSave({ id: editingId, name, ...address, password, relayKey, rememberSecrets: remember });
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : "Connection failed. Check the server details and try again.";
      if (message.includes("installation is private")) setRequiresKey(true);
      setError(message);
    }
  };

  return (
    <div className="connection-panel">
      <div className="connection-panel__title"><span><Server size={19} /></span><div><h2>Connect a server</h2><p>Your next match starts here.</p></div></div>
      <div className="connection-tabs" role="tablist" aria-label="Enter connection details">
        <button type="button" id="details-tab" role="tab" aria-selected={tab === "details"} aria-controls="connection-fields" className={tab === "details" ? "is-active" : ""} onClick={() => { setTab("details"); setError(""); }} disabled={busy}><Server size={14} />Server details</button>
        <button type="button" id="json-tab" role="tab" aria-selected={tab === "json"} aria-controls="connection-fields" className={tab === "json" ? "is-active" : ""} onClick={() => { setTab("json"); setError(""); }} disabled={busy}><Braces size={15} />Paste JSON</button>
      </div>
      <form className="connect-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} id="connection-fields" role="tabpanel" aria-labelledby={tab === "details" ? "details-tab" : "json-tab"}>
          {tab === "details" ? <>
            {profiles.length > 0 && <label className="field"><span>Saved server</span><select value={editingId ?? ""} onChange={(event) => chooseProfile(event.target.value)}><option value="">New connection</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
            <div className="field-row">
              <label className="field"><span>Server address</span><div><Globe2 size={16} /><input ref={hostRef} value={host} onChange={(event) => setHost(event.target.value)} placeholder="cs2.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" required /></div></label>
              <label className="field field--port"><span>Port</span><div><input type="number" min={1} max={65535} step={1} value={port} onChange={(event) => setPort(event.target.value)} required /></div></label>
            </div>
            <label className="field"><span>RCON password</span><div><KeyRound size={16} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your server’s RCON password" autoComplete="off" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <label className="field"><span>Profile name <em>Optional</em></span><div><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Friday night competitive" maxLength={60} /></div></label>
            {requiresKey && <label className="field"><span>Installation access key</span><div><LockKeyhole size={16} /><input type="password" value={relayKey} onChange={(event) => setRelayKey(event.target.value)} required /></div><small>This installation is private. Its owner can provide the key.</small></label>}
            <label className="remember-field"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember password on this device</span></label>
            {remember && <p className="field-hint">Saved in this browser without encryption. Use a trusted device.</p>}
            {importNote && <p className="import-success" role="status"><Check size={14} />{importNote}</p>}
          </> : <div className="json-import">
            <div className="json-import__label"><label htmlFor="connection-json">Server configuration</label><button type="button" className="text-button" onClick={() => { setJson(EXAMPLE_CONNECTION_JSON); setError(""); setImported([]); }}>Use example</button></div>
            <textarea id="connection-json" aria-describedby="json-help" value={json} onChange={(event) => { setJson(event.target.value); setImported([]); setError(""); }} placeholder={EXAMPLE_CONNECTION_JSON} autoComplete="off" spellCheck={false} maxLength={100001} rows={9} required />
            <p id="json-help">Paste a server object, an array, or a Relay settings export. We recognize <code>host</code>, <code>ip</code>, <code>rcon_port</code> and <code>rcon_password</code>, too.</p>
            {imported.length > 0 && <div className="import-choices"><p>Choose a server to review</p>{imported.map((detail, index) => <button type="button" key={index} onClick={() => fillDetails(detail)}><Server size={16} /><span><strong>{detail.name || detail.host}</strong><small>{detail.host}:{detail.port}</small></span><ChevronRight size={16} /></button>)}</div>}
          </div>}
          {error && <div className="connection-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
          <button className="button button--primary button--large connect-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" />Connecting to server…</> : <><span>{tab === "json" ? "Review connection" : "Connect server"}</span>{tab === "json" ? <FileJson size={17} /> : <ArrowRight size={18} />}</>}</button>
        </fieldset>
      </form>
      <p className="connection-privacy"><ShieldCheck size={14} /><span>Used by this app to connect. Saved only if you choose.</span></p>
      <div className="connection-demo"><span>Just looking around?</span><button className="text-button" onClick={onDemo} disabled={busy}><Sparkles size={14} />Explore demo<ArrowRight size={14} /></button></div>
      <details className="connection-help"><summary>Need help connecting?<Plus size={14} /></summary><p>Use the server’s TCP RCON address and <code>rcon_password</code>. Enable RCON on the game server and allow this app’s host through its firewall. For a LAN server, run Relay on that network.</p><p>Your password passes through the app’s host. Source RCON does not encrypt the final TCP connection; use a trusted host or private network.</p><a href="/connection-guide" target="_blank" rel="noreferrer">Connection guide and hosting options<ArrowRight size={13} /></a></details>
    </div>
  );
}
