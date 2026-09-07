import { createServer, type Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/rcon/route";
import { encodeRconPacket, RconPacketDecoder } from "../lib/server/rcon";

const servers: ReturnType<typeof createServer>[] = [];
const sockets = new Set<Socket>();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RCON_RELAY_SECRET", "");
  vi.stubEnv("RCON_ALLOW_PRIVATE", "true");
  vi.stubEnv("RCON_ALLOWED_HOSTS", "127.0.0.1");
  vi.stubEnv("RCON_ALLOWED_PORTS", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function fixture(silent = false) {
  const received: string[] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    if (silent) return;
    const decoder = new RconPacketDecoder();
    socket.on("data", (data) => {
      for (const packet of decoder.feed(typeof data === "string" ? Buffer.from(data) : data)) {
        if (packet.type === 3) socket.write(encodeRconPacket(2, packet.body.toString() === "correct" ? packet.id : -1, ""));
        else if (packet.type === 2) {
          received.push(packet.body.toString());
          socket.write(encodeRconPacket(0, packet.id, "hostname: Test CS2\nmap: de_mirage"));
        } else if (packet.type === 0) {
          socket.write(Buffer.concat([encodeRconPacket(0, packet.id, ""), encodeRconPacket(0, packet.id, Buffer.from([0,1,0,0]))]));
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  return { port: address.port, received };
}

function request(port: number, options: { password?: string; commands?: unknown; headers?: Record<string,string>; signal?: AbortSignal } = {}) {
  return new Request("http://localhost/api/rcon", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost", ...options.headers },
    body: JSON.stringify({ host: "127.0.0.1", port, password: options.password ?? "correct", commands: options.commands ?? ["status"] }),
    signal: options.signal,
  });
}

describe("integrated production RCON route", () => {
  it("reads access-key requirements at request time and forbids capability caching", async () => {
    for (const secret of ["", "private-installation-key", ""]) {
      vi.stubEnv("RCON_RELAY_SECRET", secret);
      const response = await GET();
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(await response.json()).toEqual({ ok: true, transport: "integrated-tcp", requiresAccessKey: Boolean(secret) });
    }
  });
  it("connects over real TCP in production without a deployment key", async () => {
    const { port, received } = await fixture();
    const response = await POST(request(port));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).results[0].response).toContain("Test CS2");
    expect(received).toEqual(["status"]);
    expect(await (await GET()).json()).toMatchObject({ requiresAccessKey: false, transport: "integrated-tcp" });
  });
  it("keeps explicit private-installation keys working without publishing the secret", async () => {
    vi.stubEnv("RCON_RELAY_SECRET", "private-key");
    const { port } = await fixture();
    expect((await POST(request(port))).status).toBe(401);
    expect((await POST(request(port, { headers: { "x-relay-key": "private-key" } }))).status).toBe(200);
    const capabilities = await (await GET()).text();
    expect(capabilities).toContain('"requiresAccessKey":true');
    expect(capabilities).not.toContain("private-key");
  });
  it("does not execute commands after failed RCON authentication", async () => {
    const { port, received } = await fixture();
    const response = await POST(request(port, { password: "wrong" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_FAILED");
    expect(received).toEqual([]);
  });
  it("rejects mixed command arrays without executing their valid subset", async () => {
    const { port, received } = await fixture();
    expect((await POST(request(port, { commands: ["status", 2] }))).status).toBe(400);
    expect(received).toEqual([]);
  });
  it("blocks LAN targets by default in production", async () => {
    vi.stubEnv("RCON_ALLOW_PRIVATE", "");
    const { port } = await fixture();
    const response = await POST(request(port));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("HOST_BLOCKED");
  });
  it("does not accept a forged forwarded host as same-origin", async () => {
    const response = await POST(request(27015, { headers: { Origin: "https://attacker.example", "x-forwarded-host": "attacker.example" } }));
    expect(response.status).toBe(403);
  });
  it("aborts and closes an unresponsive authenticated connection", async () => {
    const { port } = await fixture(true);
    const controller = new AbortController();
    const pending = POST(request(port, { signal: controller.signal }));
    const timer = setTimeout(() => controller.abort(), 40);
    const response = await pending;
    clearTimeout(timer);
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("REQUEST_TIMEOUT");
  });
});
