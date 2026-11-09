/** Moments of the app every DomainModule can react to. */
export type LifecycleHook = "onStart" | "onForeground" | "onLogin" | "onLogout";

type HookOwner = { [hook in LifecycleHook]: () => void | Promise<void> } & { key: string };

/**
 * Runs one hook in every module, in registration order (the core first). A failing hook is
 * reported and never stops the others nor the app.
 */
export async function runLifecycle(
  modules: readonly HookOwner[],
  hook: LifecycleHook,
  onError: (module: string, error: unknown) => void,
): Promise<void> {
  for (const module of modules) {
    try {
      await module[hook]();
    } catch (error) {
      onError(module.key, error);
    }
  }
}
