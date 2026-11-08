// Records what the scheduler was asked to do, shared with the CJS stub.
const globals = globalThis as { __expoRegisteredTasks?: Map<string, unknown> };
const registered = (globals.__expoRegisteredTasks ??= new Map());

export const BackgroundTaskResult = { Success: 1, Failed: 2 } as const;

export async function registerTaskAsync(name: string, options?: unknown): Promise<void> {
  registered.set(name, options);
}

export async function unregisterTaskAsync(name: string): Promise<void> {
  registered.delete(name);
}
