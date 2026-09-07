export class RequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Enforce the real streamed size; Content-Length is neither required nor trusted. */
export async function readJsonBody(request: Request, limit = 100_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError(415, "INVALID_CONTENT_TYPE", "Send an application/json request.");
  }
  if (Number(request.headers.get("content-length")) > limit) {
    throw new RequestError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "INVALID_JSON", "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => undefined);
        throw new RequestError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
      }
      chunks.push(value);
    }
    if (timedOut) throw new RequestError(408, "REQUEST_TIMEOUT", "The request body took too long to arrive.");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "INVALID_JSON", "The request body is not valid JSON.");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
