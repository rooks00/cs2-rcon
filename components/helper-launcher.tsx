"use client";

import { Check, Copy, Monitor, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { getKnownLocalHelper, helperLaunchCommand, helperWebsiteOrigin, rememberLocalHelper, pairBrowserHelper, type LocalHelperMetadata } from "@/lib/helper-install";

export function HelperLauncher({ origin, onPaired }: { origin?: string; onPaired?: (helper: LocalHelperMetadata) => void }) {
  const [platform, setPlatform] = useState<"unix" | "windows">("unix");
  const [site, setSite] = useState(() => helperWebsiteOrigin(origin));
  const [token, setToken] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    const resolveSite = async () => {
      setPlatform(/Windows/i.test(navigator.userAgent) ? "windows" : "unix");
      const knownSite = helperWebsiteOrigin(origin) ?? getKnownLocalHelper()?.site;
      if (knownSite) {
        setSite(knownSite);
        window.clearTimeout(timeout);
        return;
      }
      let source = window.location.origin;
      try {
        const response = await fetch("/api/rcon", { cache: "no-store", signal: controller.signal });
        const value: unknown = response.ok ? await response.json() : null;
        if (value && typeof value === "object" && "transport" in value && value.transport === "local-tcp" && "hostedSite" in value) {
          const hostedSite = helperWebsiteOrigin(value.hostedSite);
          if (hostedSite) {
            source = hostedSite;
            rememberLocalHelper({ site: hostedSite, version: "helperVersion" in value && typeof value.helperVersion === "string" ? value.helperVersion : "" });
          }
        }
      } catch {
        // The page's own origin still serves the installer if metadata is unavailable.
        source = getKnownLocalHelper()?.site ?? source;
      } finally {
        window.clearTimeout(timeout);
        if (active) setSite(source);
      }
    };
    queueMicrotask(() => { if (active) void resolveSite(); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [origin]);

  const command = site ? helperLaunchCommand(site, platform, Boolean(onPaired)) : "Preparing your installation command…";
  const copy = async () => {
    if (!site) return;
    try { await navigator.clipboard.writeText(command); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const pair = async () => {
    setPairing(true); setPairError("");
    try {
      const helper = await pairBrowserHelper(token, window.location.origin);
      setToken("");
      onPaired?.(helper);
    } catch (issue) {
      setPairError(issue instanceof TypeError ? "Could not reach the helper. Check the terminal and allow local-network access in your browser, or use the local workspace in the connection guide." : issue instanceof Error ? issue.message : "Pairing failed.");
    } finally { setPairing(false); }
  };
  return <section className="helper-launcher" aria-label="Start a local helper">
    <div className="helper-launcher__intro"><span><Monitor size={21} /></span><h3>Your server, from this computer.</h3><p>For LAN servers, VPNs, or a blocked hosted connection. {onPaired ? "A tiny native helper connects this tab to your computer." : "A tiny native helper opens this same workspace locally."}</p></div>
    <div className="segmented" aria-label="Choose your operating system">
      <button type="button" aria-pressed={platform === "unix"} className={platform === "unix" ? "is-active" : ""} onClick={() => { setPlatform("unix"); setCopied(false); }}>macOS / Linux</button>
      <button type="button" aria-pressed={platform === "windows"} className={platform === "windows" ? "is-active" : ""} onClick={() => { setPlatform("windows"); setCopied(false); }}>Windows</button>
    </div>
    <div className="helper-command"><div><SquareTerminal size={14} /><span>{platform === "windows" ? "PowerShell" : "Terminal"}</span><button type="button" onClick={() => void copy()} disabled={!site} aria-label="Copy helper command">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div><pre tabIndex={0} aria-live="polite"><code>{command}</code></pre></div>
    {copyError && <p className="helper-copy-error" role="status">Select the command above and copy it into your terminal.</p>}
    {onPaired ? <form className="helper-pairing" onSubmit={(event) => { event.preventDefault(); if (!pairing && token.trim()) void pair(); }}>
      <label className="field"><span>Pairing token</span><div><input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste the helper token" disabled={pairing} /></div></label>
      <p className="helper-pairing__prompt">Run the command, paste its token, and connect.</p>
      <button type="submit" className="button button--primary connect-submit" disabled={pairing || !token.trim()}>{pairing ? "Connecting…" : "Connect this tab"}</button>
      {pairError && <p className="helper-copy-error" role="alert">{pairError}</p>}
    </form> : <>
      <ol className="helper-steps"><li>Run the command in {platform === "windows" ? "PowerShell" : "Terminal"}.</li><li>Enter your server details in the local workspace that opens.</li><li>Keep the terminal open. Press <kbd>Ctrl+C</kbd> to stop.</li></ol>
      <p className="helper-footnote"><Check size={13} />No Docker, Node.js, admin rights, or background service.</p>
      <p className="helper-footnote">The helper downloads to a temporary folder and checks its checksum before running. The website supplies the UI; RCON traffic stays on your computer.</p>
    </>}
  </section>;
}
