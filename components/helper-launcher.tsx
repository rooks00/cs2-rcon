"use client";

import { ArrowLeft, ArrowUpRight, Check, Copy, Monitor, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { helperLaunchCommand } from "@/lib/helper-install";

export function HelperLauncher({ onBack }: { onBack: () => void }) {
  const [platform, setPlatform] = useState<"unix" | "windows">(() => /Windows/i.test(navigator.userAgent) ? "windows" : "unix");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const origin = window.location.origin;
  const command = helperLaunchCommand(origin, platform);
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  return <section className="helper-launcher" aria-label="Start a local helper">
    <div className="helper-launcher__intro"><span><Monitor size={21} /></span><h3>Your server, from this computer.</h3><p>For LAN servers, VPNs, or a blocked hosted connection. A tiny native helper opens this same workspace locally.</p></div>
    <div className="segmented" aria-label="Choose your operating system">
      <button type="button" aria-pressed={platform === "unix"} className={platform === "unix" ? "is-active" : ""} onClick={() => { setPlatform("unix"); setCopied(false); }}>macOS / Linux</button>
      <button type="button" aria-pressed={platform === "windows"} className={platform === "windows" ? "is-active" : ""} onClick={() => { setPlatform("windows"); setCopied(false); }}>Windows</button>
    </div>
    <div className="helper-command"><div><SquareTerminal size={14} /><span>{platform === "windows" ? "PowerShell" : "Terminal"}</span><button type="button" onClick={() => void copy()} aria-label="Copy helper command">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div><pre tabIndex={0}><code>{command}</code></pre></div>
    {copyError && <p className="helper-copy-error" role="status">Select the command above and copy it into your terminal.</p>}
    <ol className="helper-steps"><li>Run the command in {platform === "windows" ? "PowerShell" : "Terminal"}.</li><li>Enter your server details in the local workspace that opens.</li><li>Keep the terminal open. Press <kbd>Ctrl+C</kbd> to stop.</li></ol>
    <p className="helper-footnote"><Check size={13} />No Docker, Node.js, admin rights, or background service.</p>
    <p className="helper-footnote">The helper downloads to a temporary folder and checks its checksum before running. The website supplies the UI; RCON traffic stays on your computer.</p>
    <div className="helper-links"><button type="button" className="text-button" onClick={onBack}><ArrowLeft size={13} />Use hosted connection</button><a href="/connection-guide#local-helper" target="_blank" rel="noreferrer">Details<ArrowUpRight size={13} /></a></div>
  </section>;
}
