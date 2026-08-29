import { describe, expect, it } from "vitest";
import { isPublicAddress, relaySecretMatches } from "../lib/server/security";

describe("relay security", () => {
  it("compares relay secrets", () => {
    expect(relaySecretMatches("correct horse", "correct horse")).toBe(true);
    expect(relaySecretMatches("correct horse", "wrong horse")).toBe(false);
  });

  it("blocks private and reserved IPv4 targets", () => {
    expect(isPublicAddress("8.8.8.8", 4)).toBe(true);
    expect(isPublicAddress("127.0.0.1", 4)).toBe(false);
    expect(isPublicAddress("10.1.2.3", 4)).toBe(false);
    expect(isPublicAddress("172.20.1.1", 4)).toBe(false);
    expect(isPublicAddress("192.168.1.1", 4)).toBe(false);
    expect(isPublicAddress("169.254.169.254", 4)).toBe(false);
    expect(isPublicAddress("203.0.113.5", 4)).toBe(false);
  });

  it("allows global IPv6 and blocks local/documentation ranges", () => {
    expect(isPublicAddress("2606:4700:4700::1111", 6)).toBe(true);
    expect(isPublicAddress("::1", 6)).toBe(false);
    expect(isPublicAddress("fd00::1", 6)).toBe(false);
    expect(isPublicAddress("fe80::1", 6)).toBe(false);
    expect(isPublicAddress("2001:db8::1", 6)).toBe(false);
  });
});
