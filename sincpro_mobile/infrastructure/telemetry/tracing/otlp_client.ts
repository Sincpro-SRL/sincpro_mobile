import { DEFAULT_SEND_TIMEOUT_MS, fetchWithTimeout } from "../fetch_with_timeout.ts";
import type { OtlpConfig } from "../types.ts";
import { serializeToOtlp } from "./otlp_serializer.ts";
import type { SpanRow } from "./span_queue_repository.ts";

/**
 * Sends a batch of spans to an OTLP/HTTP collector (Grafana Alloy, Jaeger, etc.).
 * Throws on non-2xx so the caller (span_flush_job) can apply backoff.
 */
export class OtlpClient {
  private readonly config: OtlpConfig;
  private readonly timeoutMs: number;

  constructor(config: OtlpConfig, timeoutMs = DEFAULT_SEND_TIMEOUT_MS) {
    this.config = config;
    this.timeoutMs = timeoutMs;
  }

  async deliver(spans: SpanRow[]): Promise<void> {
    if (spans.length === 0) return;

    const body = JSON.stringify(serializeToOtlp(spans));
    const url = `${this.config.endpoint.replace(/\/$/, "")}/v1/traces`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body,
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      throw new Error(`OTLP collector responded ${res.status}`);
    }
  }
}
