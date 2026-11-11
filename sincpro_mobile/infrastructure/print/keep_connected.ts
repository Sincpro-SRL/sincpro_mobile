import type { IPrinterConnection } from "@sincpro/mobile/domain/print";
import {
  createReconnector,
  RECONNECT_DELAYS_MS,
} from "@sincpro/mobile/infrastructure/print/reconnect";
import { AppState } from "react-native";

/**
 * Keeps the chosen printer connected while the app runs:
 * 1. Tries at once, so a restart or a crash does not leave it disconnected.
 * 2. Tries again when the app returns to the foreground and when the link is lost (printer off
 *    or out of reach), backing off up to the last delay.
 * 3. A disconnection by the person stops it.
 * Final: answers the cleanup that removes the listeners and the pending try.
 *
 * Context: each try is `restore` — the core executes `CommandRestorePrinterConnection`, so every
 * one is a run with its span; resolving `true` means nothing is left to do.
 */
export function keepPrinterConnected(
  restore: () => Promise<boolean>,
  onConnectionChange: (listener: (connection: IPrinterConnection) => void) => () => void,
  delays: readonly number[] = RECONNECT_DELAYS_MS,
): () => void {
  const reconnector = createReconnector(restore, delays);
  reconnector.start();
  const offConnection = onConnectionChange(({ reason }) => {
    if (reason === "link_lost") reconnector.start();
    if (reason === "user_disconnect") reconnector.stop();
  });
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") reconnector.start();
  });
  return () => {
    reconnector.stop();
    offConnection();
    appState.remove();
  };
}
