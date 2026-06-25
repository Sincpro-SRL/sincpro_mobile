import { DEFAULT_SEND_TIMEOUT_MS, fetchWithTimeout } from "../fetch_with_timeout.ts";
import type { LokiConfig } from "../types.ts";
import type { LogEntry, LogQueueRepository } from "./log_queue_repository.ts";

// ---------------------------------------------------------------------------
// Monotonic nanosecond timestamp
// Loki rejects duplicate timestamps within the same stream (HTTP 400).
// If two push() calls happen in the same millisecond they'd produce identical
// ns values — the counter guarantees strict monotonicity.
// ---------------------------------------------------------------------------
let _lastMs = 0;
let _nsSeq = 0;

/** @internal — exposed for compliance testing only */
export function _nowNs(): string {
  const ms = Date.now();
  if (ms === _lastMs) {
    _nsSeq += 1;
  } else {
    _lastMs = ms;
    _nsSeq = 0;
  }
  // BigInt required: ms * 1_000_000 ≈ 1.78e18 in 2026, which exceeds Number.MAX_SAFE_INTEGER
  // (~9e15). Float64 granularity at that magnitude is ~512, so the _nsSeq offset would be
  // invisible — producing duplicate timestamps that Loki rejects with HTTP 400.
  return String(BigInt(ms) * 1_000_000n + BigInt(_nsSeq));
}

/**
 * HTTP client for Loki's push API (`POST /loki/api/v1/push`).
 *
 * `push()` is fire-and-forget: on failure it enqueues to the outbox (if provided) so the
 * flush cron can retry. `deliver()` is the awaitable batch-send used by the flush cron.
 */
export class LokiClient {
  private readonly config: LokiConfig;
  private readonly queue: LogQueueRepository | null;
  private readonly timeoutMs: number;

  constructor(
    config: LokiConfig,
    queue?: LogQueueRepository,
    timeoutMs = DEFAULT_SEND_TIMEOUT_MS,
  ) {
    this.config = config;
    this.queue = queue ?? null;
    this.timeoutMs = timeoutMs;
  }

  push(level: string, message: string): void {
    const body = JSON.stringify({
      streams: [
        {
          stream: { ...this.config.labels, level },
          values: [[_nowNs(), message]],
        },
      ],
    });

    fetchWithTimeout(
      `${this.config.endpoint}/loki/api/v1/push`,
      {
        method: "POST",
        headers: this.requestHeaders(),
        body,
      },
      this.timeoutMs,
    ).catch(() => {
      const q = this.queue;
      if (q) {
        queueMicrotask(() => q.enqueue(level, message).catch(() => {}));
      }
    });
  }

  /**
   * Batch-delivers outbox entries to Loki. Groups entries by level into separate streams.
   * Throws on network error or non-2xx response — caller must not remove entries from the
   * outbox unless this resolves successfully.
   */
  async deliver(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const byLevel = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      if (!byLevel.has(entry.level)) byLevel.set(entry.level, []);
      byLevel.get(entry.level)!.push(entry);
    }

    const streams = Array.from(byLevel.entries()).map(([level, levelEntries]) => ({
      stream: { ...this.config.labels, level },
      values: levelEntries.map((entry, i) => {
        const baseNs =
          BigInt(new Date(entry.created_at.replace(" ", "T") + "Z").getTime()) * 1_000_000n;
        return [String(baseNs + BigInt(i)), entry.message] as [string, string];
      }),
    }));

    const res = await fetchWithTimeout(
      `${this.config.endpoint}/loki/api/v1/push`,
      {
        method: "POST",
        headers: this.requestHeaders(),
        body: JSON.stringify({ streams }),
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      throw new Error(`Loki batch delivery failed: HTTP ${res.status}`);
    }
  }

  /**
   * Builds the headers for every request: the `auth` shortcut, then any custom
   * `headers` (which win on conflict — e.g. a gateway API key, or an explicit
   * Authorization overriding `auth`), then a non-negotiable `Content-Type`.
   * The body is always JSON, so a custom `content-type` (any casing) must not
   * override it — Loki would reject the push.
   */
  private requestHeaders(): Record<string, string> {
    const custom = { ...this.config.headers };
    for (const key of Object.keys(custom)) {
      if (key.toLowerCase() === "content-type") delete custom[key];
    }
    return {
      ...this.authHeader(),
      ...custom,
      "Content-Type": "application/json",
    };
  }

  private authHeader(): Record<string, string> {
    const auth = this.config.auth;
    if (!auth) return {};
    if (auth.type === "basic") {
      return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}` };
    }
    return { Authorization: `Bearer ${auth.token}` };
  }
}
