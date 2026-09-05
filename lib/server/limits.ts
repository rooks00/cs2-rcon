import { RequestError } from "./request";

type Bucket = { count: number; active: number; failures: number; expires: number };

/** Per-process backstop. Public multi-instance hosting also needs proxy-level limits. */
export class ConnectionLimiter {
  private buckets = new Map<string, Bucket>();

  acquire(key = "global", now = Date.now()): () => void {
    for (const [id, bucket] of this.buckets) {
      if (bucket.expires <= now && !bucket.active) this.buckets.delete(id);
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 1_000) throw new RequestError(429, "SERVER_BUSY", "Connection capacity reached. Try again in a minute.");
      bucket = { count: 0, active: 0, failures: 0, expires: now + 60_000 };
      this.buckets.set(key, bucket);
    } else if (bucket.expires <= now) {
      bucket.count = 0;
      bucket.failures = 0;
      bucket.expires = now + 60_000;
    }
    const global = key === "global";
    if (bucket.active >= (global ? 12 : 3) || bucket.count >= (global ? 240 : 60) || bucket.failures >= 5) {
      throw new RequestError(429, "RATE_LIMITED", "Too many connection attempts. Wait a minute and check your RCON password before retrying.");
    }
    bucket.count++;
    bucket.active++;
    let released = false;
    return () => { if (!released) { bucket.active--; released = true; } };
  }

  authenticationFailed(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket) bucket.failures++;
  }
}

export const connectionLimiter = new ConnectionLimiter();
