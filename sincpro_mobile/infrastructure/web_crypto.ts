import * as Crypto from "expo-crypto";

type RandomSource = {
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
  randomUUID?: () => string;
};

/**
 * Web Crypto's random source on a phone — what @sincpro/client-framework reads for every id: a
 * run's (`newEntityId`), an entity's, an idempotency key's (`globalThis.crypto.getRandomValues`
 * and `randomUUID`). Hermes has neither; expo-crypto gives both, from the platform's secure
 * source.
 *
 * Context: installed when the kernel is built (`createKernel`), while the bundle loads and before
 * any Command runs — a run needs its id before anything else. It used to be installed only when
 * an entity made its first id, so a Command that ran first (the network cron, the history
 * pruning) failed with "Cannot read property 'getRandomValues' of undefined". What the platform
 * already has is kept; only a missing method is added.
 */
export function installWebCrypto(): void {
  const host = globalThis as { crypto?: RandomSource };
  const existing = host.crypto;
  if (
    typeof existing?.getRandomValues === "function" &&
    typeof existing.randomUUID === "function"
  ) {
    return;
  }
  const missing: RandomSource = {
    getRandomValues:
      existing?.getRandomValues?.bind(existing) ??
      (<T extends ArrayBufferView>(array: T): T =>
        Crypto.getRandomValues(array as never) as unknown as T),
    randomUUID: existing?.randomUUID?.bind(existing) ?? (() => Crypto.randomUUID()),
  };
  Object.defineProperty(globalThis, "crypto", {
    value: existing ? Object.assign(Object.create(existing), missing) : missing,
    configurable: true,
    writable: true,
  });
}
