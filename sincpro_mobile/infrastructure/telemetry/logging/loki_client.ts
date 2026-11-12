import { DEFAULT_SEND_TIMEOUT_MS, fetchWithTimeout } from "../fetch_with_timeout";
import type { LokiConfig } from "../types";
import type { LogEntry } from "./log_queue_repository";

/** Loki answered, and refused: its HTTP status says why (401/403: its credentials). */
export class LokiRefused extends Error {
  constructor(readonly status: number) {
    super(`Loki refused the logs: HTTP ${status}`);
    this.name = "LokiRefused";
  }
}

/**
 * HTTP client for Loki's push API (`POST /loki/api/v1/push`): `deliver()` sends a batch of the
 * lines the log queue kept.
 *
 * Context: a line is never sent alone — it is stored first (`shipLog`) and sent in a batch with
 * the ones around it, as spans are: one request for many lines, and an offline phone pays
 * nothing per line. A batch Loki does not accept throws, so the flush keeps it for the next.
 */
export class LokiClient {
  private readonly config: LokiConfig;
  private readonly timeoutMs: number;

  constructor(config: LokiConfig, timeoutMs = DEFAULT_SEND_TIMEOUT_MS) {
    this.config = config;
    this.timeoutMs = timeoutMs;
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

    if (!res.ok) throw new LokiRefused(res.status);
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
