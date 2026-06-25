export type LokiAuth =
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string };

export interface LokiConfig {
  /** Base URL of the Loki instance, e.g. "https://loki.myserver.com" */
  endpoint: string;
  /** Labels attached to every log stream (app, env, tenant, …) */
  labels: Record<string, string>;
  /**
   * Standard auth shortcut (Basic / Bearer). For anything else use `headers`.
   * Omit both for unauthenticated (internal/self-hosted) setups.
   */
  auth?: LokiAuth;
  /**
   * Arbitrary headers added to every Loki request — for gateways/proxies that
   * authenticate with custom keys (e.g. `{ "api-key": "…" }`,
   * `{ "sincpro-api-key": "…" }`, `{ "X-Scope-OrgID": "tenant-1" }`).
   * Merged after `auth`, so an explicit `Authorization` here overrides `auth`.
   */
  headers?: Record<string, string>;
}

export interface OtlpConfig {
  /** OTLP/HTTP collector base URL, e.g. "https://alloy.myserver.com" */
  endpoint: string;
  /** Optional headers (Authorization, X-Scope-OrgID, …) */
  headers?: Record<string, string>;
}

export interface FlushConfig {
  /**
   * Background safety-net interval in minutes (≥15 → real OS background task).
   * Set to 0 to disable the cron entirely and rely only on the production
   * signal (and connectivity events, if enabled). Default 15.
   */
  backgroundIntervalMin?: number;
  /**
   * Subscribe to the app's InternetIsUp/Down events to drain the backlog the
   * moment connectivity returns. Off by default — the framework does not
   * require the app's connectivity cron. Default false.
   */
  onConnectivityEvents?: boolean;
  /** HTTP send timeout in ms (fail fast instead of hanging). Default 4000. */
  sendTimeoutMs?: number;
  /** Coalescing window in ms for production-triggered flushes. Default 3000. */
  debounceMs?: number;
}

export interface TelemetryConfig {
  /** Omit to disable log shipping (e.g. traces-only setup). */
  loki?: LokiConfig;
  /** Omit to disable span flushing (e.g. logs-only setup). */
  otlp?: OtlpConfig;
  /** Delivery tuning — triggers, timeout, debounce. Sensible defaults if omitted. */
  flush?: FlushConfig;
}

/**
 * Snapshot of a bounded telemetry buffer.
 *
 * Telemetry is best-effort and bounded: when a device stays offline, the
 * buffer fills and the oldest data is evicted. These numbers make that loss
 * observable instead of silent. Business-critical data must NOT live here.
 */
export interface BufferStats {
  /** Rows currently buffered. */
  rows: number;
  /** Lower-bound estimate of buffered payload text in bytes (sum of field lengths). */
  approxBytes: number;
  /**
   * Rows EVICTED after being buffered, since process start. This is the buffer
   * back-pressure indicator — a rising value means data was buffered then lost
   * because the device stayed offline past the cap.
   */
  dropped: number;
  /**
   * Items refused at INGEST by head sampling (never buffered), since process
   * start. Distinct from `dropped`: a healthy sampler shedding load under
   * pressure raises this without signalling buffer distress. 0 for log buffers
   * (logs are not head-sampled).
   */
  sampled: number;
}

export interface TelemetryBufferStats {
  /** Log queue stats, or null when log shipping is disabled. */
  logs: BufferStats | null;
  /** Span queue stats, or null when tracing is disabled. */
  spans: BufferStats | null;
}
