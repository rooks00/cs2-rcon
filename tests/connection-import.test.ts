import { describe, expect, it } from "vitest";
import { parseConnectionJson, parseServerAddress } from "../lib/connection-import";

describe("pasted connection details", () => {
  it("accepts flat details and preserves password whitespace", () => {
    expect(parseConnectionJson('{"host":"cs2.example.com","password":" secret "}')).toEqual([
      { name: "", host: "cs2.example.com", port: 27015, password: " secret " },
    ]);
  });
  it("recognizes aliases and nested rcon settings", () => {
    expect(parseConnectionJson('{"name":"Match","rcon":{"ip":"cs2.example.com","rcon_port":"28015","rcon_password":"secret"}}')[0])
      .toEqual({ name: "Match", host: "cs2.example.com", port: 28015, password: "secret" });
  });
  it("imports multiple profiles from a safe Relay export without inventing passwords", () => {
    const profiles = parseConnectionJson('{"version":1,"profiles":[{"id":"one","name":"EU","host":"one.example.com","port":27015},{"host":"two.example.com"}]}');
    expect(profiles).toHaveLength(2);
    expect(profiles[0].password).toBe("");
    expect(profiles[0]).not.toHaveProperty("id");
  });
  it("accepts host:port and bracketed IPv6", () => {
    expect(parseServerAddress("cs2.example.com:28015")).toEqual({ host: "cs2.example.com", port: 28015 });
    expect(parseServerAddress("[2001:4860::1]:28015")).toEqual({ host: "2001:4860::1", port: 28015 });
    expect(parseServerAddress("2001:4860::1")).toEqual({ host: "2001:4860::1", port: 27015 });
  });
  it.each(["not json", "null", "[]", '{"host":"https://example.com"}', '{"host":"a","port":true}', '{"host":"a","port":2.5}', '{"host":"a","port":65536}', '{"host":"a","password":1}', '{"host":"a","password":"\\u0000"}'])
    ("rejects invalid configuration: %s", (input) => expect(() => parseConnectionJson(input)).toThrow());
  it("caps imported profile count and document size", () => {
    expect(() => parseConnectionJson(JSON.stringify(Array(51).fill({ host: "a" })))).toThrow("1–50");
    expect(() => parseConnectionJson(" ".repeat(100001))).toThrow("too large");
  });
  it("rejects invalid manually entered addresses and ports", () => {
    expect(() => parseServerAddress("a/path")).toThrow();
    expect(() => parseServerAddress("bad:ipv6")).toThrow();
    expect(() => parseServerAddress("a", 0)).toThrow();
  });
});
