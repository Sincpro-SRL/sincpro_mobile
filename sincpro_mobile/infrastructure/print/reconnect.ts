/** Waits between reconnection tries: quick at first, then every 30 s at most. */
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export interface Reconnector {
  /** Tries now and, while it fails, again after each delay. Restarting resets the delays. */
  start(): void;
  /** Cancels the pending try, e.g. when the user disconnects on purpose. */
  stop(): void;
}

/**
 * One reconnection loop for a device that should stay connected:
 * 1. `attempt` resolves `true` when there is nothing left to do (connected, or nothing to
 *    reconnect to) and `false` when it should try again.
 * 2. After a failure it waits the next delay; after the last one it gives up until `start`
 *    runs again, so a printer that stays off does not drain the battery.
 * 3. Only one try runs at a time; a `start` during a try restarts the delays after it.
 * Final: `stop` cancels the pending try and ignores the result of the running one.
 */
export function createReconnector(
  attempt: () => Promise<boolean>,
  delays: readonly number[] = RECONNECT_DELAYS_MS,
): Reconnector {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let restart = false;
  let generation = 0;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = async (step: number, current: number) => {
    timer = null;
    running = true;
    let done = false;
    try {
      done = await attempt();
    } catch {
      done = false;
    } finally {
      running = false;
    }
    if (current !== generation) return;
    if (restart) {
      restart = false;
      void run(0, current);
      return;
    }
    if (done || step >= delays.length) return;
    timer = setTimeout(() => void run(step + 1, current), delays[step]);
  };

  return {
    start() {
      clear();
      if (running) {
        restart = true;
        return;
      }
      void run(0, generation);
    },
    stop() {
      clear();
      restart = false;
      generation += 1;
    },
  };
}
