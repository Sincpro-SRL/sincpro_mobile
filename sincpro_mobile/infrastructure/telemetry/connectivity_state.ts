/**
 * Self-correcting online/offline flag for the telemetry pipeline.
 *
 * The framework does NOT depend on the app's connectivity cron — that is
 * client-specific and optional. Instead this flag is corrected from two cheap,
 * always-available sources:
 *   - the outcome of each delivery attempt (success → online, network failure → offline)
 *   - optional connectivity events, when the host app emits them
 *
 * It exists to skip delivery attempts while known-offline (avoiding hung HTTP
 * and wasted work); the send timeout in the HTTP clients is the backstop when
 * the flag is optimistically wrong.
 */
export class ConnectivityState {
  private online: boolean;

  constructor(initiallyOnline = true) {
    this.online = initiallyOnline;
  }

  isOnline(): boolean {
    return this.online;
  }

  markOnline(): void {
    this.online = true;
  }

  markOffline(): void {
    this.online = false;
  }
}
