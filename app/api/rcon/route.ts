import { NextResponse } from "next/server";
import { executeRconCommands, RconError } from "@/lib/server/rcon";
import { isSameOriginRequest, relaySecretMatches, resolvePublicRconHost, TargetValidationError } from "@/lib/server/security";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

interface RequestBody {
  host?: unknown;
  port?: unknown;
  password?: unknown;
  command?: unknown;
  commands?: unknown;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "ORIGIN_BLOCKED", "Cross-origin relay requests are not allowed.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "INVALID_CONTENT_TYPE", "The relay accepts application/json requests only.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 100_000) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "The RCON request body is too large.");
  }

  const expectedSecret = process.env.RCON_RELAY_SECRET;
  if (process.env.NODE_ENV === "production" && !expectedSecret) {
    return errorResponse(503, "RELAY_NOT_CONFIGURED", "Set RCON_RELAY_SECRET in the Vercel project before using live RCON.");
  }
  if (expectedSecret && !relaySecretMatches(request.headers.get("x-relay-key") ?? "", expectedSecret)) {
    return errorResponse(401, "INVALID_RELAY_KEY", "The relay access key is missing or incorrect.");
  }

  let body: RequestBody;
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as RequestBody : {};
  } catch {
    return errorResponse(400, "INVALID_JSON", "The request body is not valid JSON.");
  }

  const host = typeof body.host === "string" ? body.host.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const port = typeof body.port === "number" ? body.port : Number(body.port);
  const commandList = Array.isArray(body.commands) ? body.commands : [body.command];
  const commands = commandList.filter((command): command is string => typeof command === "string").map((command) => command.trim());

  if (!host) return errorResponse(400, "INVALID_HOST", "A game-server hostname is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return errorResponse(400, "INVALID_PORT", "RCON port must be between 1 and 65535.");
  if (!password || Buffer.byteLength(password, "utf8") > 1_000 || password.includes("\0")) {
    return errorResponse(400, "INVALID_PASSWORD", "Enter a valid RCON password (up to 1000 bytes)." );
  }
  if (!commands.length || commands.length > 100 || commands.some((command) => !command || command.includes("\0") || Buffer.byteLength(command, "utf8") > 4_000)) {
    return errorResponse(400, "INVALID_COMMAND", "Send 1–100 non-empty commands, each no larger than 4000 bytes.");
  }

  try {
    const resolved = await resolvePublicRconHost(host);
    const configuredTimeout = Number(process.env.RCON_TIMEOUT_MS ?? 6000);
    const timeoutMs = Math.min(15_000, Math.max(1_000, Number.isFinite(configuredTimeout) ? configuredTimeout : 6_000));
    const results = await executeRconCommands(
      { host: resolved.address, port, password, timeoutMs },
      commands,
    );
    return NextResponse.json({ ok: true, results }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof TargetValidationError) return errorResponse(400, error.code, error.message);
    if (error instanceof RconError) {
      const status = error.code === "AUTH_FAILED" ? 401 : error.code.endsWith("TIMEOUT") ? 504 : 502;
      return errorResponse(status, error.code, error.message);
    }
    return errorResponse(500, "RELAY_ERROR", "The RCON relay encountered an unexpected error.");
  }
}
