import type { OutboxEntry, TelemetryQueueRepository } from "./queue_repository";

export type LokiAuth =
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string };

export interface LokiConfig {
  /** Base URL of the Loki instance, e.g. "https://loki.myserver.com" */
  endpoint: string;
  /** Labels attached to every log stream (app, env, tenant, …) */
  labels: Record<string, string>;
  /** Optional auth — omit for unauthenticated (internal/self-hosted) setups */
  auth?: LokiAuth;
}

export interface TelemetryConfig {
  loki: LokiConfig;
}

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
  private readonly queue: TelemetryQueueRepository | null;

  constructor(config: LokiConfig, queue?: TelemetryQueueRepository) {
    this.config = config;
    this.queue = queue ?? null;
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

    fetch(`${this.config.endpoint}/loki/api/v1/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeader() },
      body,
    }).catch(() => {
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
  async deliver(entries: OutboxEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Group by level; track per-level index to offset duplicate second-precision timestamps.
    // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" — second precision means two entries
    // in the same second and level would produce identical ns values → Loki 400.
    const byLevel = new Map<string, OutboxEntry[]>();
    for (const entry of entries) {
      if (!byLevel.has(entry.level)) byLevel.set(entry.level, []);
      byLevel.get(entry.level)!.push(entry);
    }

    const streams = Array.from(byLevel.entries()).map(([level, levelEntries]) => ({
      stream: { ...this.config.labels, level },
      values: levelEntries.map((entry, i) => {
        // SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS"; append Z for ISO parse.
        // BigInt required for the same precision reason as _nowNs.
        const baseNs =
          BigInt(new Date(entry.created_at.replace(" ", "T") + "Z").getTime()) * 1_000_000n;
        return [String(baseNs + BigInt(i)), entry.message] as [string, string];
      }),
    }));

    const res = await fetch(`${this.config.endpoint}/loki/api/v1/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeader() },
      body: JSON.stringify({ streams }),
    });

    if (!res.ok) {
      throw new Error(`Loki batch delivery failed: HTTP ${res.status}`);
    }
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

let _client: LokiClient | null = null;

/**
 * Low-level client initializer. Prefer `initTelemetry` from the telemetry index, which also
 * wires the SQLite outbox and the flush cron. Use this directly only in tests.
 */
export function initTelemetry(
  config: TelemetryConfig,
  queue?: TelemetryQueueRepository,
): void {
  _client = new LokiClient(config.loki, queue);
}

/** Returns the active LokiClient, or null if telemetry was not initialized. */
export function getLokiClient(): LokiClient | null {
  return _client;
}

/** @internal — test use only */
export function _resetTelemetry(): void {
  _client = null;
}
