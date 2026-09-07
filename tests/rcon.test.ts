import { createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { encodeRconPacket, executeRconCommands, RconError, RconPacketDecoder } from "../lib/server/rcon";

const sockets = new Set<Socket>();
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("RconPacketDecoder", () => {
  it("handles partial and coalesced TCP chunks", () => {
    const first = encodeRconPacket(0, 7, "hello");
    const second = encodeRconPacket(0, 8, "world");
    const combined = Buffer.concat([first, second]);
    const decoder = new RconPacketDecoder();
    expect(decoder.feed(combined.subarray(0, 3))).toEqual([]);
    expect(decoder.feed(combined.subarray(3, 17))).toEqual([]);
    const packets = decoder.feed(combined.subarray(17));
    expect(packets.map((packet) => [packet.id, packet.body.toString()])).toEqual([[7, "hello"], [8, "world"]]);
  });
});

describe("executeRconCommands", () => {
  it("authenticates, batches commands, and joins split responses", async () => {
    const server = createServer((socket) => {
      sockets.add(socket);
      const decoder = new RconPacketDecoder();
      let pending: { id: number; command: string } | null = null;
      socket.on("data", (chunk) => {
        for (const packet of decoder.feed(typeof chunk === "string" ? Buffer.from(chunk) : chunk)) {
          if (packet.type === 3) {
            const response = Buffer.concat([encodeRconPacket(0, packet.id, ""), encodeRconPacket(2, packet.id, "")]);
            socket.write(response.subarray(0, 9));
            socket.write(response.subarray(9));
          } else if (packet.type === 2) {
            pending = { id: packet.id, command: packet.body.toString() };
          } else if (packet.type === 0 && pending) {
            const response = Buffer.concat([
              encodeRconPacket(0, pending.id, `${pending.command}:part-one|`),
              encodeRconPacket(0, pending.id, "part-two"),
              encodeRconPacket(0, pending.id, ""),
              encodeRconPacket(0, pending.id, Buffer.from([0, 1, 0, 0])),
            ]);
            socket.write(response.subarray(0, 5));
            socket.write(response.subarray(5, 23));
            socket.write(response.subarray(23));
            pending = null;
          }
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");

    const results = await executeRconCommands({ host: "127.0.0.1", port: address.port, password: "test", timeoutMs: 1000 }, ["status", "listid"]);
    expect(results.map((result) => result.response)).toEqual(["status:part-one|part-two", "listid:part-one|part-two"]);
  });

  it("reports authentication failures", async () => {
    const server = createServer((socket) => {
      sockets.add(socket);
      const decoder = new RconPacketDecoder();
      socket.on("data", (chunk) => {
        for (const packet of decoder.feed(typeof chunk === "string" ? Buffer.from(chunk) : chunk)) {
          if (packet.type === 3) socket.write(encodeRconPacket(2, -1, ""));
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");

    await expect(executeRconCommands({ host: "127.0.0.1", port: address.port, password: "wrong", timeoutMs: 1000 }, ["status"]))
      .rejects.toMatchObject({ code: "AUTH_FAILED" } satisfies Partial<RconError>);
  });

  it("treats an expected RCON disconnect during a level transition as dispatched", async () => {
    const server = createServer((socket) => {
      sockets.add(socket);
      const decoder = new RconPacketDecoder();
      socket.on("data", (chunk) => {
        for (const packet of decoder.feed(typeof chunk === "string" ? Buffer.from(chunk) : chunk)) {
          if (packet.type === 3) socket.write(Buffer.concat([encodeRconPacket(0, packet.id, ""), encodeRconPacket(2, packet.id, "")]));
          else if (packet.type === 2 && packet.body.toString().startsWith("host_workshop_map")) socket.destroy();
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");

    const [result] = await executeRconCommands(
      { host: "127.0.0.1", port: address.port, password: "test", timeoutMs: 1000 },
      ["host_workshop_map 3070244462"],
    );
    expect(result.response).toContain("dispatched");
  });
});
