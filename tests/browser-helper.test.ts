import { afterEach, describe, expect, it, vi } from "vitest";
import { BROWSER_HELPER_ENDPOINT, disconnectBrowserHelper, fetchRcon, hasBrowserHelper, helperLaunchCommand, pairBrowserHelper } from "../lib/helper-install";

const site = "https://relay.example.com";
const token = "a".repeat(64);
const pairedResponse = () => new Response(JSON.stringify({ ok: true, transport: "local-tcp", hostedSite: site, helperVersion: "0.2.0" }));
afterEach(() => { disconnectBrowserHelper(); vi.unstubAllGlobals(); });
describe("same-tab helper transport", () => {
  it("pairs only on explicit input, keeps credentials local and fails closed", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(pairedResponse()).mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    await pairBrowserHelper(token, site);
    expect(hasBrowserHelper()).toBe(true);
    await expect(fetchRcon({ method: "POST", headers: { "x-relay-key": "host-key" }, body: "command" })).rejects.toThrow("offline");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(BROWSER_HELPER_ENDPOINT);
    const init = fetcher.mock.calls[1][1];
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(init.headers.has("x-relay-key")).toBe(false);
  });
  it("rejects a helper paired with another website", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pairedResponse()));
    await expect(pairBrowserHelper(token, "https://other.example.com")).rejects.toThrow("Pairing failed");
    expect(hasBrowserHelper()).toBe(false);
  });
  it("does not contact the network with malformed tokens", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(pairBrowserHelper("invalid", site)).rejects.toThrow("64-character");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the hosted route only after explicit disconnection", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(pairedResponse()));
    vi.stubGlobal("fetch", fetcher);
    await pairBrowserHelper(token, site);
    disconnectBrowserHelper();
    await fetchRcon();
    expect(fetcher.mock.lastCall?.[0]).toBe("/api/rcon");
  });
  it("offers separate same-tab and fallback launch commands", () => {
    expect(helperLaunchCommand(site, "unix", true)).toContain("--browser-connect");
    expect(helperLaunchCommand(site, "windows", true)).toContain("-BrowserConnect");
    expect(helperLaunchCommand(site, "unix")).not.toContain("--browser-connect");
  });
});
