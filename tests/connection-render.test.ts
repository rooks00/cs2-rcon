import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionPanel } from "../components/connection-panel";
import { HelperLauncher } from "../components/helper-launcher";

describe("connection first render", () => {
  it("offers the installation access key before any capability request has completed", () => {
    const html = renderToStaticMarkup(createElement(ConnectionPanel, {
      profiles: [], activeProfile: null, secrets: { password: "", relayKey: "" }, busy: false,
      onSave: async () => undefined, onDemo: () => undefined,
    }));
    expect(html).toContain("Installation access key");
    expect(html).toContain("Hosted connection");
    expect(html).toContain("Use this device");
  });

  it("renders guide installer commands without browser globals", () => {
    const html = renderToStaticMarkup(createElement(HelperLauncher, { origin: "https://cs2.example.com" }));
    expect(html).toContain("curl -fsSL");
    expect(html).toContain("https://cs2.example.com/relay/install.sh");
    expect(html).not.toContain("Use hosted connection");
    expect(() => renderToStaticMarkup(createElement(HelperLauncher))).not.toThrow();
  });
});
