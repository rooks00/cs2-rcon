import { describe, expect, it } from "vitest";
import { readJsonBody } from "../lib/server/request";
import { ConnectionLimiter } from "../lib/server/limits";

describe("anonymous connection limits", () => {
  it("enforces actual body size when Content-Length is missing or understated", async () => {
    const variations: Record<string, string>[] = [{}, { "Content-Length": "1" }];
    for (const headers of variations) {
      const request = new Request("http://localhost/api/rcon", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ data: "x".repeat(100) }) });
      await expect(readJsonBody(request, 50)).rejects.toMatchObject({ status: 413 });
    }
  });
  it("rejects malformed JSON and unsupported media types", async () => {
    await expect(readJsonBody(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(readJsonBody(new Request("http://localhost", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
  });
  it("bounds concurrent sockets and releases a slot only once", () => {
    const limiter = new ConnectionLimiter();
    const releases = Array.from({ length: 3 }, () => limiter.acquire("target", 100));
    expect(() => limiter.acquire("target", 100)).toThrow("Too many");
    releases[0](); releases[0]();
    const release = limiter.acquire("target", 100);
    expect(() => limiter.acquire("target", 100)).toThrow();
    release(); releases[1](); releases[2]();
  });
  it("backs off after repeated bad passwords and expires the block", () => {
    const limiter = new ConnectionLimiter();
    for (let i = 0; i < 5; i++) { limiter.acquire("target", 100)(); limiter.authenticationFailed("target"); }
    expect(() => limiter.acquire("target", 200)).toThrow("Too many");
    expect(() => limiter.acquire("target", 60101)).not.toThrow();
  });
  it("limits requests even when sockets are immediately closed", () => {
    const limiter = new ConnectionLimiter();
    for (let i = 0; i < 60; i++) limiter.acquire("target", 100)();
    expect(() => limiter.acquire("target", 200)).toThrow();
    expect(() => limiter.acquire("different-target", 200)).not.toThrow();
  });
});
