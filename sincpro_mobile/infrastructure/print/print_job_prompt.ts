import type { PrintJobOffer, PrintJobPrompt } from "@sincpro/mobile/domain/print/print_job";

/**
 * The print jobs waiting for the person, in the order they came — the `PrintJobPrompt` the
 * AppShell's sheet follows (`subscribe` / `current`, for `useSyncExternalStore`). The sheet
 * shows the first; the next one shows when it closes.
 */
export class PrintJobPromptStore implements PrintJobPrompt {
  private offers: readonly PrintJobOffer[] = [];
  private readonly listeners = new Set<() => void>();

  show(offer: PrintJobOffer): void {
    const at = this.offers.findIndex((one) => one.job.id === offer.job.id);
    this.offers =
      at < 0
        ? [...this.offers, offer]
        : this.offers.map((one, index) => (index === at ? offer : one));
    this.emit();
  }

  close(jobId: string): void {
    const kept = this.offers.filter((one) => one.job.id !== jobId);
    if (kept.length === this.offers.length) return;
    this.offers = kept;
    this.emit();
  }

  /** The job the sheet shows, or `null` when none waits. */
  readonly current = (): PrintJobOffer | null => this.offers[0] ?? null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const printJobPrompt = new PrintJobPromptStore();
