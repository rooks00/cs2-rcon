import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/server/security";

export const runtime = "nodejs";
export const maxDuration = 10;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "ORIGIN_BLOCKED", "Cross-origin metadata requests are not allowed.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "INVALID_CONTENT_TYPE", "The endpoint accepts application/json only.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 20_000) return errorResponse(413, "REQUEST_TOO_LARGE", "The metadata request is too large.");

  let ids: string[] = [];
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && Array.isArray((body as { ids?: unknown }).ids)) {
      ids = [...new Set((body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === "string" && /^\d{5,20}$/.test(id)))].slice(0, 100);
    }
  } catch {
    return errorResponse(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
  if (!ids.length) return NextResponse.json({ ok: true, items: [] }, { headers: NO_STORE_HEADERS });

  const form = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => form.set(`publishedfileids[${index}]`, id));

  try {
    const steamResponse = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!steamResponse.ok) return errorResponse(502, "STEAM_API_ERROR", "Steam did not return Workshop metadata.");
    const payload: unknown = await steamResponse.json();
    const details = (payload as { response?: { publishedfiledetails?: unknown } })?.response?.publishedfiledetails;
    const items = Array.isArray(details)
      ? details.flatMap((detail) => {
          if (!detail || typeof detail !== "object") return [];
          const item = detail as { publishedfileid?: unknown; title?: unknown; result?: unknown; consumer_app_id?: unknown };
          if (item.result !== 1 || item.consumer_app_id !== 730 || typeof item.publishedfileid !== "string" || typeof item.title !== "string") return [];
          const title = item.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160);
          return title ? [{ id: item.publishedfileid, title }] : [];
        })
      : [];
    return NextResponse.json({ ok: true, items }, { headers: NO_STORE_HEADERS });
  } catch {
    return errorResponse(502, "STEAM_API_ERROR", "Workshop metadata could not be retrieved from Steam.");
  }
}
