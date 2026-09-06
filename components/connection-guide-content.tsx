"use client";

import { ArrowLeft, Check, ChevronDown, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AmbientArtwork, ArtworkMotionControl, ArtworkStage } from "@/components/ambient-artwork";
import { HelperLauncher } from "@/components/helper-launcher";
import { RelayLogo } from "@/components/relay-logo";
import "./connection-guide.css";

const EXAMPLE_JSON = `{
  "name": "Match server",
  "host": "cs2.example.com",
  "port": 27015,
  "password": "your-rcon-password"
}`;

function GuideCode({ title, value }: { title: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };
  return <div className="guide-code">
    <div className="guide-code__header"><span>{title}</span><button type="button" onClick={() => void copy()} aria-label={`Copy ${title}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
    </button></div>
    <pre tabIndex={0} aria-label={title}><code>{value}</code></pre>
    {copyFailed && <p className="guide-copy-status" role="status">Select the text above and copy it manually.</p>}
  </div>;
}

export interface ConnectionGuideContentProps {
  onBack?: () => void;
  helperOrigin?: string;
}

/** Shared by the workspace and the direct route; the parent owns the artwork provider. */
export function ConnectionGuideContent({ onBack, helperOrigin }: ConnectionGuideContentProps) {
  return <section className="guide-workspace" aria-labelledby="connection-guide-title">
    <div className="guide-intro">
      {onBack && <button className="text-button guide-back" type="button" onClick={onBack}><ArrowLeft size={14} />Back to workspace</button>}
      <ArtworkStage />
      <div className="guide-intro__copy">
        <h1 id="connection-guide-title">Connect to your server.</h1>
        <p>From the website or your own device. Choose the connection that can reach your server.</p>
      </div>
      <nav className="guide-contents" aria-label="Connection guide sections">
        <a href="#local-helper">Use this device</a>
        <a href="#server-setup">Server setup</a>
        <a href="#guide-json">Paste JSON</a>
        <a href="#guide-troubleshooting">Troubleshooting</a>
      </nav>
    </div>

    <div className="guide-manual">
      <section className="guide-section guide-start" aria-labelledby="guide-hosted-title">
        <h2 id="guide-hosted-title">Connect through the website</h2>
        <p>Enter your server address, TCP port, and RCON password in CS2 RCON. The hosted connection is ready by default, including on Vercel.</p>
        <p>You only need the local helper below for a LAN or VPN server, or when the hosted connection cannot reach your server.</p>
      </section>

      <section id="local-helper" className="guide-helper" aria-labelledby="guide-helper-title">
        <h2 id="guide-helper-title">Use this device</h2>
        <HelperLauncher origin={helperOrigin} />
      </section>

      <section id="server-setup" className="guide-section" aria-labelledby="guide-setup-title">
        <h2 id="guide-setup-title">Prepare your game server</h2>
        <ol className="guide-setup-steps">
          <li><strong>Enable RCON and set a password.</strong><p>Use your host’s RCON settings or the server configuration loaded at startup.</p>
            <GuideCode title="Server configuration" value={'rcon_password "choose-a-strong-password"'} />
          </li>
          <li><strong>Allow the TCP port.</strong><p>The usual port is <code>27015</code>, but your provider may assign another. Opening only the game’s UDP port is not enough. Allow the website’s connection source, or your computer when using the helper.</p></li>
          <li><strong>Connect and check the console.</strong><p>Enter the address, port, and password. A successful connection reads the server status and opens your console.</p></li>
        </ol>
        <p className="guide-note">Some game hosts offer a proprietary console. Ask your provider for a Source RCON TCP endpoint if it does not expose an RCON address.</p>
      </section>

      <section id="guide-json" className="guide-section" aria-labelledby="guide-json-title">
        <h2 id="guide-json-title">Paste a configuration</h2>
        <p>Choose <strong>Paste JSON</strong> in the connection form. Review the imported details, then connect.</p>
        <GuideCode title="Example JSON" value={EXAMPLE_JSON} />
        <p>Aliases such as <code>ip</code>, <code>address</code>, <code>rcon_port</code>, and <code>rcon_password</code> work too. You can import nested server objects, arrays, or a CS2 RCON settings export.</p>
        <p className="guide-note">Importing fills the form. It does not connect or save your password automatically.</p>
      </section>

      <section id="guide-troubleshooting" className="guide-section" aria-labelledby="guide-troubleshooting-title">
        <h2 id="guide-troubleshooting-title">If a connection fails</h2>
        <dl className="guide-troubleshooting">
          <div><dt>Connection refused</dt><dd>Check that the game server is running, RCON is enabled, and the TCP port is correct.</dd></div>
          <div><dt>Connection timed out</dt><dd>Check the firewall and port forwarding. For a LAN or VPN server, run the helper on a computer that can reach that network.</dd></div>
          <div><dt>Authentication failed</dt><dd>Verify the RCON password before retrying. Repeated incorrect attempts may cause the server to block the connection source.</dd></div>
          <div><dt>Private address blocked</dt><dd>Use the local helper to connect from your own network. A public website cannot reach a server on your home network.</dd></div>
          <div><dt>Too many attempts</dt><dd>Wait a minute before trying again. Check the password and connection details first.</dd></div>
          <div><dt>The helper is already running</dt><dd>Use the workspace link in its terminal, or press <kbd>Ctrl+C</kbd> there before starting it again.</dd></div>
        </dl>
        <p className="guide-note">RCON manages a running server. It cannot start a stopped game process, edit host files, or stream incoming chat on its own.</p>
      </section>

      <div className="guide-details">
        <details className="guide-detail">
          <summary>Passwords and local data<ChevronDown size={16} /></summary>
          <div>
            <p>With the hosted connection, your password passes through this website’s server to authenticate with CS2. With the helper, passwords and RCON commands travel directly from your computer to the game server. The website still supplies the interface and optional Workshop titles.</p>
            <p>Passwords stay out of browser storage unless you choose <strong>Remember password on this device</strong>. A remembered password is stored without encryption. Helper and hosted profiles are separate because they belong to different browser origins.</p>
            <p>HTTPS protects the browser’s connection to this website. Source RCON does not encrypt the final TCP connection to your game server; use a trusted host or private network.</p>
          </div>
        </details>
        <details className="guide-detail">
          <summary>About the temporary helper<ChevronDown size={16} /></summary>
          <div>
            <p>The command downloads an approximately 4 MB native app to a temporary folder, verifies its checksum, and opens a local workspace. It supports Intel/AMD and ARM64 on Windows, macOS, and Linux.</p>
            <p>A one-time local link pairs your browser automatically. Keep the terminal open while you work; <kbd>Ctrl+C</kbd> stops the helper. Temporary files are removed on normal exit, and no background service is installed.</p>
            <p>The executables are unsigned. Review any operating-system prompt normally. The checksum detects a damaged download; it does not replace trusting the website that provides it.</p>
            <p>Ordinary browser pages cannot open raw TCP connections. The hosted connection or this small helper handles TCP for CS2 RCON.</p>
          </div>
        </details>
        <details className="guide-detail">
          <summary>Host the full website yourself<ChevronDown size={16} /></summary>
          <div>
            <p>With the project checked out and Node.js 22 or newer installed, run:</p>
            <GuideCode title="Start the website" value={'npm ci\nnpm run build\nnpm start'} />
            <p>Open <code>http://localhost:3000</code>. The repository also includes an optional Docker setup: <code>docker compose up --build -d</code>.</p>
            <p>For a public installation, use HTTPS, set <code>RCON_PUBLIC_ORIGIN</code> to the website’s origin, and apply request and connection limits at your reverse proxy.</p>
            <p>To reach a private server from a production installation, explicitly allow its exact address:</p>
            <GuideCode title="Private server settings" value={'RCON_ALLOW_PRIVATE=true\nRCON_ALLOWED_HOSTS=192.168.1.50'} />
            <p>Keep that installation on a trusted network or behind access control. Container loopback refers to the container itself.</p>
            <p>An installation access key is optional. If a private installation asks for one, its owner has configured <code>RCON_RELAY_SECRET</code>. Removing it and restarting restores keyless access.</p>
          </div>
        </details>
      </div>
    </div>
  </section>;
}

/** Direct links retain the same atmosphere and artwork as the main workspace. */
export function ConnectionGuidePage() {
  return <div className="app-shell app-shell--guide">
    <AmbientArtwork>
      <header className="topbar guide-topbar">
        <Link className="topbar__brand" href="/" aria-label="CS2 RCON home"><RelayLogo /></Link>
        <div className="topbar__actions"><ArtworkMotionControl /><Link className="button button--secondary" href="/"><ArrowLeft size={14} />Back to workspace</Link></div>
      </header>
      <main className="workspace" id="main-content"><div className="content-wrap"><ConnectionGuideContent /></div></main>
    </AmbientArtwork>
  </div>;
}
