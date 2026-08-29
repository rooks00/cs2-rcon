import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/workshop/route";

afterEach(() => vi.unstubAllGlobals());

describe("Workshop metadata route", () => {
  it("returns only safe CS2 Workshop titles for requested IDs", async () => {
    const steamFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: {
        publishedfiledetails: [
          { publishedfileid: "3070244462", result: 1, consumer_app_id: 730, title: "Aim Botz - Aim Training (CS2)" },
          { publishedfileid: "99999", result: 9 },
        ],
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", steamFetch);

    const response = await POST(new Request("http://localhost/api/workshop", {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" },
      body: JSON.stringify({ ids: ["3070244462", "99999"] }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, items: [{ id: "3070244462", title: "Aim Botz - Aim Training (CS2)" }] });
    expect(steamFetch).toHaveBeenCalledOnce();
    expect(String(steamFetch.mock.calls[0][1]?.body)).toContain("publishedfileids%5B0%5D=3070244462");
  });

  it("does not call Steam when no valid IDs were supplied", async () => {
    const steamFetch = vi.fn();
    vi.stubGlobal("fetch", steamFetch);
    const response = await POST(new Request("http://localhost/api/workshop", {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" },
      body: JSON.stringify({ ids: ["bad-id"] }),
    }));
    expect(await response.json()).toEqual({ ok: true, items: [] });
    expect(steamFetch).not.toHaveBeenCalled();
  });
});
