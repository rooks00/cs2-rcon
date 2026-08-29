import { createConnection, type Socket } from "node:net";

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const MAX_PACKET_SIZE = 65_536;
const MAX_RESPONSE_BYTES = 2_000_000;
const RESPONSE_QUIET_MS = 900;

export type RconErrorCode =
  | "CONNECT_FAILED"
  | "CONNECT_TIMEOUT"
  | "AUTH_FAILED"
  | "AUTH_TIMEOUT"
  | "RESPONSE_TIMEOUT"
  | "CONNECTION_CLOSED"
  | "INVALID_PACKET"
  | "COMMAND_TOO_LONG";

export class RconError extends Error {
  constructor(
    public readonly code: RconErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RconError";
  }
}

export interface RconPacket {
  id: number;
  type: number;
  body: Buffer<ArrayBufferLike>;
}

export interface RconTarget {
  host: string;
  port: number;
  password: string;
  timeoutMs: number;
}

export interface ExecutedCommand {
  command: string;
  response: string;
  durationMs: number;
  truncated?: boolean;
}

export function encodeRconPacket(type: number, id: number, body: string | Buffer): Buffer {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  const packetSize = payload.length + 10;
  if (packetSize > 4096) {
    throw new RconError("COMMAND_TOO_LONG", "RCON packet exceeds the Source protocol limit.");
  }

  const packet = Buffer.allocUnsafe(packetSize + 4);
  packet.writeInt32LE(packetSize, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  packet[12 + payload.length] = 0;
  packet[13 + payload.length] = 0;
  return packet;
}

export class RconPacketDecoder {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  feed(chunk: Buffer): RconPacket[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const packets: RconPacket[] = [];

    while (this.buffer.length >= 4) {
      const size = this.buffer.readInt32LE(0);
      if (size < 10 || size > MAX_PACKET_SIZE) {
        throw new RconError("INVALID_PACKET", `Server returned an invalid RCON packet size (${size}).`);
      }
      if (this.buffer.length < size + 4) break;

      const raw = this.buffer.subarray(0, size + 4);
      this.buffer = this.buffer.subarray(size + 4);
      if (raw[raw.length - 1] !== 0 || raw[raw.length - 2] !== 0) {
        throw new RconError("INVALID_PACKET", "Server returned malformed RCON string terminators.");
      }

      packets.push({
        id: raw.readInt32LE(4),
        type: raw.readInt32LE(8),
        body: Buffer.from(raw.subarray(12, raw.length - 2)),
      });
    }

    return packets;
  }
}

interface PacketWaiter {
  resolve: (packet: RconPacket) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class RconSession {
  private socket: Socket | null = null;
  private readonly decoder = new RconPacketDecoder();
  private readonly queue: RconPacket[] = [];
  private waiter: PacketWaiter | null = null;
  private terminalError: Error | null = null;
  private requestId = Math.floor(Math.random() * 1_000_000) + 100;

  constructor(private readonly target: RconTarget) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = createConnection({ host: this.target.host, port: this.target.port });
      this.socket = socket;
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 1_000);

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new RconError("CONNECT_TIMEOUT", "The game server did not accept the TCP connection in time."));
      }, this.target.timeoutMs);

      socket.on("data", (chunk) => this.onData(chunk));
      socket.on("error", (error) => {
        const wrapped = new RconError(settled ? "CONNECTION_CLOSED" : "CONNECT_FAILED", friendlySocketError(error));
        this.onTerminalError(wrapped);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(wrapped);
        }
      });
      socket.on("close", () => {
        this.onTerminalError(new RconError("CONNECTION_CLOSED", "The game server closed the RCON connection."));
      });
      socket.once("connect", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async authenticate(): Promise<void> {
    const authId = this.nextId();
    await this.write(encodeRconPacket(SERVERDATA_AUTH, authId, this.target.password));
    const deadline = Date.now() + this.target.timeoutMs;

    while (Date.now() < deadline) {
      const packet = await this.readPacket(Math.max(1, deadline - Date.now()), "AUTH_TIMEOUT");
      if (packet.type !== SERVERDATA_AUTH_RESPONSE) continue;
      if (packet.id === -1) {
        throw new RconError("AUTH_FAILED", "Authentication failed. Check the RCON password before retrying.");
      }
      if (packet.id === authId) return;
    }

    throw new RconError("AUTH_TIMEOUT", "The server did not finish RCON authentication in time.");
  }

  async execute(command: string): Promise<ExecutedCommand> {
    const startedAt = Date.now();
    const commandId = this.nextId();
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    let truncated = false;
    let receivedResponse = false;

    await this.write(encodeRconPacket(SERVERDATA_EXECCOMMAND, commandId, command));
    // Valve Source servers answer this probe after every response fragment. It is
    // the only reliable delimiter when a command returns exactly 4096-byte parts.
    await this.write(encodeRconPacket(SERVERDATA_RESPONSE_VALUE, commandId, ""));

    const deadline = Date.now() + this.target.timeoutMs;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const waitMs = receivedResponse ? Math.min(remaining, RESPONSE_QUIET_MS) : remaining;
      let packet: RconPacket;
      try {
        packet = await this.readPacket(Math.max(1, waitMs), "RESPONSE_TIMEOUT");
      } catch (error) {
        if (receivedResponse && error instanceof RconError && error.code === "RESPONSE_TIMEOUT") break;
        if (receivedResponse && error instanceof RconError && error.code === "CONNECTION_CLOSED") break;
        throw error;
      }

      if (packet.type !== SERVERDATA_RESPONSE_VALUE || packet.id !== commandId) continue;
      receivedResponse = true;

      const previous = chunks.at(-1);
      if (previous?.length === 0 && isTerminator(packet.body)) {
        chunks.pop();
        break;
      }

      if (responseBytes < MAX_RESPONSE_BYTES) {
        const available = MAX_RESPONSE_BYTES - responseBytes;
        chunks.push(packet.body.subarray(0, available));
        responseBytes += Math.min(packet.body.length, available);
        if (packet.body.length > available) truncated = true;
      } else {
        truncated = true;
      }
    }

    if (!receivedResponse) {
      throw new RconError("RESPONSE_TIMEOUT", "The server accepted the connection but did not answer the command.");
    }

    return {
      command,
      response: Buffer.concat(chunks).toString("utf8").replace(/\0+$/g, ""),
      durationMs: Date.now() - startedAt,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private nextId(): number {
    this.requestId = (this.requestId + 1) & 0x7fffffff;
    return this.requestId || 1;
  }

  private async write(packet: Buffer): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed || !socket.writable) {
      throw new RconError("CONNECTION_CLOSED", "The RCON connection is not writable.");
    }
    await new Promise<void>((resolve, reject) => {
      socket.write(packet, (error) => {
        if (error) reject(new RconError("CONNECTION_CLOSED", friendlySocketError(error)));
        else resolve();
      });
    });
  }

  private readPacket(timeoutMs: number, timeoutCode: "AUTH_TIMEOUT" | "RESPONSE_TIMEOUT"): Promise<RconPacket> {
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
    if (this.terminalError) return Promise.reject(this.terminalError);
    if (this.waiter) return Promise.reject(new Error("Internal RCON read collision."));

    return new Promise<RconPacket>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter?.timer === timer) this.waiter = null;
        reject(new RconError(timeoutCode, timeoutCode === "AUTH_TIMEOUT" ? "RCON authentication timed out." : "RCON response timed out."));
      }, timeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }

  private onData(chunk: Buffer): void {
    try {
      this.queue.push(...this.decoder.feed(chunk));
      this.pumpQueue();
    } catch (error) {
      this.onTerminalError(error instanceof Error ? error : new Error("Invalid RCON response."));
      this.socket?.destroy();
    }
  }

  private pumpQueue(): void {
    if (!this.waiter || !this.queue.length) return;
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(this.queue.shift()!);
  }

  private onTerminalError(error: Error): void {
    this.terminalError ??= error;
    if (!this.waiter) return;
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

function isTerminator(body: Buffer): boolean {
  return body.length === 4 && body[0] === 0 && body[1] === 1 && body[2] === 0 && body[3] === 0;
}

function friendlySocketError(error: Error & { code?: string }): string {
  switch (error.code) {
    case "ECONNREFUSED":
      return "Connection refused. Confirm the TCP RCON port and the server's -usercon setting.";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "The game server is not reachable from the relay.";
    case "ENOTFOUND":
      return "The server hostname could not be resolved.";
    case "ETIMEDOUT":
      return "The TCP connection to the game server timed out.";
    case "ECONNRESET":
      return "The game server reset the RCON connection.";
    default:
      return "The RCON TCP connection failed.";
  }
}

export async function executeRconCommands(target: RconTarget, commands: string[]): Promise<ExecutedCommand[]> {
  const session = new RconSession(target);
  try {
    await session.connect();
    await session.authenticate();
    const results: ExecutedCommand[] = [];
    for (const command of commands) results.push(await session.execute(command));
    return results;
  } finally {
    session.close();
  }
}
