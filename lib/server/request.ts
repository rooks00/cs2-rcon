export class RequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Enforce the real streamed size; Content-Length is neither required nor trusted. */
export async function readJsonBody(request: Request, limit = 100_000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError(415, "INVALID_CONTENT_TYPE", "Send an application/json request.");
  }
  if (Number(request.headers.get("content-length")) > limit) {
    throw new RequestError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
  }
  return readJsonStream(request.body, limit, request.signal);
}

/** Also bound upstream JSON, which can contain much more data than we use. */
export async function readJsonStream(body: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal): Promise<unknown> {
  const reader = body?.getReader();
  if (!reader) throw new RequestError(400, "INVALID_JSON", "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timedOut = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 5_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        cancel();
        throw new RequestError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
      }
      chunks.push(value);
    }
    if (timedOut || signal?.aborted) throw new RequestError(408, "REQUEST_TIMEOUT", "The request body timed out or was cancelled.");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timedOut || signal?.aborted) throw new RequestError(408, "REQUEST_TIMEOUT", "The request body timed out or was cancelled.");
    throw new RequestError(400, "INVALID_JSON", "The request body is not valid JSON.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
