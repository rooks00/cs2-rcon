import { describe, expect, it } from "vitest";
import { helperLaunchCommand, helperWebsiteOrigin } from "../lib/helper-install";

describe("portable helper launch commands", () => {
  it("uses the current deployment for both the launcher and the UI source", () => {
    expect(helperLaunchCommand("https://relay.example.com", "unix")).toBe("curl -fsSL 'https://relay.example.com/relay/install.sh' | sh -s -- 'https://relay.example.com'");
    expect(helperLaunchCommand("https://relay.example.com", "windows")).toContain("-Site 'https://relay.example.com'");
  });
  it("supports local development ports", () => {
    expect(helperLaunchCommand("http://localhost:3004", "unix")).toContain("http://localhost:3004/relay/install.sh");
  });
  it.each(["javascript:alert(1)", "https://user:pass@example.com", "https://example.com/path", "https://example.com?command=x"])("rejects non-origins: %s", (input) => expect(() => helperLaunchCommand(input,"unix")).toThrow());
  it("accepts only web URLs returned by the native helper", () => {
    expect(helperWebsiteOrigin("https://relay.example.com")).toBe("https://relay.example.com");
    expect(helperWebsiteOrigin("javascript:alert(1)")).toBeNull();
    expect(helperWebsiteOrigin(null)).toBeNull();
  });
});
