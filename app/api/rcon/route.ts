import { NextResponse } from "next/server";
import { executeRconCommands, RconError } from "@/lib/server/rcon";
import { isSameOriginRequest, relaySecretMatches, resolvePublicRconHost, TargetValidationError } from "@/lib/server/security";
import { readJsonBody, RequestError } from "@/lib/server/request";
import { connectionLimiter } from "@/lib/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, {
    status, headers: { ...NO_STORE_HEADERS, ...(status === 429 ? { "Retry-After": "60" } : {}) },
  });
}

// Runtime capability, never the value of any deployment secret.
export async function GET() {
  return NextResponse.json({ ok: true, transport: "integrated-tcp", requiresAccessKey: Boolean(process.env.RCON_RELAY_SECRET) }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "ORIGIN_BLOCKED", "Cross-origin RCON requests are not allowed.");
  const expectedSecret = process.env.RCON_RELAY_SECRET;
  if (expectedSecret && !relaySecretMatches(request.headers.get("x-relay-key") ?? "", expectedSecret)) {
    return errorResponse(401, "INVALID_RELAY_KEY", "This installation is private. Enter the access key provided by its owner.");
  }

  let releaseRequest: (() => void) | undefined;
  let releaseTarget: (() => void) | undefined;
  let targetKey = "";
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
  try {
    releaseRequest = connectionLimiter.acquire();
    const parsed = await readJsonBody(request);
    const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    const host = typeof body.host === "string" ? body.host.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const port = typeof body.port === "number" || typeof body.port === "string" ? Number(body.port) : NaN;
    const commandList = body.commands === undefined ? [body.command] : body.commands;
    if (!host) throw new RequestError(400, "INVALID_HOST", "A game-server hostname is required.");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new RequestError(400, "INVALID_PORT", "RCON port must be between 1 and 65535.");
    const allowedPorts = process.env.RCON_ALLOWED_PORTS?.split(",").map((value) => value.trim()).filter(Boolean).map(Number);
    if (allowedPorts?.length ? !allowedPorts.includes(port) : port < 1024) {
      throw new RequestError(400, "PORT_BLOCKED", "This port is restricted by the installation. RCON normally uses port 27015.");
    }
    if (!password || Buffer.byteLength(password, "utf8") > 1_000 || password.includes("\0")) {
      throw new RequestError(400, "INVALID_PASSWORD", "Enter a valid RCON password (up to 1000 bytes).");
    }
    if (!Array.isArray(commandList) || !commandList.length || commandList.length > 100 || commandList.some((command) =>
      typeof command !== "string" || !command.trim() || command.includes("\0") || Buffer.byteLength(command, "utf8") > 4_000)) {
      throw new RequestError(400, "INVALID_COMMAND", "Send 1–100 non-empty commands, each no larger than 4000 bytes.");
    }
    const commands = (commandList as string[]).map((command) => command.trim());
    // Bound DNS separately; connect only to the resolved, validated address.
    const resolved = await new Promise<Awaited<ReturnType<typeof resolvePublicRconHost>>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RequestError(504, "DNS_TIMEOUT", "Hostname lookup timed out. Check the address and try again.")), 5_000);
      resolvePublicRconHost(host).then(resolve, reject).finally(() => clearTimeout(timer));
    });
    targetKey = `${resolved.address}:${port}`;
    releaseTarget = connectionLimiter.acquire(targetKey);
    const configuredTimeout = Number(process.env.RCON_TIMEOUT_MS ?? 6000);
    const timeoutMs = Math.min(15_000, Math.max(1_000, Number.isFinite(configuredTimeout) ? configuredTimeout : 6_000));
    const results = await executeRconCommands({ host: resolved.address, port, password, timeoutMs, signal }, commands);
    return NextResponse.json({ ok: true, results }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof RequestError) return errorResponse(error.status, error.code, error.message);
    if (error instanceof TargetValidationError) return errorResponse(400, error.code, error.message);
    if (error instanceof RconError) {
      if (error.code === "AUTH_FAILED") connectionLimiter.authenticationFailed(targetKey);
      return errorResponse(error.code === "AUTH_FAILED" ? 401 : error.code.endsWith("TIMEOUT") ? 504 : 502, error.code, error.message);
    }
    return errorResponse(500, "CONNECTION_ERROR", "The connection could not be completed. Check the server details and try again.");
  } finally {
    releaseTarget?.();
    releaseRequest?.();
  }
}
