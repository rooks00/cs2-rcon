import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublicAddress, isSameOriginRequest, resolvePublicRconHost } from "../lib/server/security";
import { lookup } from "node:dns/promises";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("destination and origin policy", () => {
  it("accepts the public Host when Next rewrites a container request URL", () => {
    expect(isSameOriginRequest(new Request("http://0.0.0.0:3000/api/rcon", {
      headers: { Host: "127.0.0.1:3117", Origin: "http://127.0.0.1:3117" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("http://0.0.0.0:3000/api/rcon", {
      headers: { Host: "127.0.0.1:3117", Origin: "https://evil.example", "x-forwarded-host": "evil.example" },
    }))).toBe(false);
  });
  it("rejects mixed public/private DNS responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(lookup).mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }] as never);
    await expect(resolvePublicRconHost("cs2.example.com")).rejects.toMatchObject({ code: "HOST_BLOCKED" });
  });
  it("returns the exact validated address to prevent a second DNS lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(lookup).mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
    expect(await resolvePublicRconHost("CS2.EXAMPLE.COM")).toEqual({ address: "8.8.8.8", family: 4, hostname: "cs2.example.com" });
    expect(lookup).toHaveBeenCalledOnce();
  });
  it("does not allow metadata IPs even in private development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(lookup).mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    await expect(resolvePublicRconHost("metadata.example.com")).rejects.toMatchObject({ code: "HOST_BLOCKED" });
  });
  it("requires an exact host allowlist for production private targets", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RCON_ALLOW_PRIVATE", "true"); vi.stubEnv("RCON_ALLOWED_HOSTS", "*.example.com");
    vi.mocked(lookup).mockResolvedValue([{ address: "192.168.1.2", family: 4 }] as never);
    await expect(resolvePublicRconHost("cs2.example.com")).rejects.toMatchObject({ code: "HOST_BLOCKED" });
    vi.stubEnv("RCON_ALLOWED_HOSTS", "cs2.example.com");
    expect((await resolvePublicRconHost("cs2.example.com")).address).toBe("192.168.1.2");
  });
  it.each(["2002:7f00:1::", "2001::1", "2001:2::1", "2001:20::1", "3fff::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])("blocks reserved, transition, or mapped local address %s", (ip) => expect(isPublicAddress(ip, 6)).toBe(false));
  it("compares the scheme as well as the host", () => {
    expect(isSameOriginRequest(new Request("http://example.com/api/rcon", { headers: { Origin: "https://example.com" } }))).toBe(false);
    vi.stubEnv("RCON_PUBLIC_ORIGIN", "https://example.com");
    expect(isSameOriginRequest(new Request("http://localhost/api/rcon", { headers: { Origin: "https://example.com" } }))).toBe(true);
  });
});
