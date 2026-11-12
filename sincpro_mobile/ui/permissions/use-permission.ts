import type { EPermission, PermissionStatus } from "@sincpro/mobile/domain/permissions";
import { permissionStates } from "@sincpro/mobile/infrastructure/permission_states";
import {
  CommandCheckPermission,
  CommandOpenPermissionSettings,
  CommandRequestPermission,
  commonBoundedContext,
} from "@sincpro/mobile/services";
import { withCleanup } from "@sincpro/mobile/tools/utils/async";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import type { PermissionAction } from "./prompt";

/** A permission as a screen holds it. */
export interface PermissionControl {
  /** `undefined` until it is first read. */
  readonly status: PermissionStatus | undefined;
  readonly granted: boolean;
  /** Asking for it, or opening the settings. */
  readonly busy: boolean;
  /** Reads it again, never asking. */
  check(): Promise<PermissionStatus>;
  /** The system's dialog: only from what a person did. */
  request(): Promise<PermissionStatus>;
  /** This app's page in the system's settings. */
  openSettings(): Promise<void>;
  /** What the person tapped: ask for it, or open the settings (`permissionPrompt`). */
  act(action: PermissionAction): Promise<unknown>;
}

/** A run that fails was already recorded and reported by it; a screen keeps showing what it knew. */
const quietly = (run: Promise<unknown>) => void run.catch(() => undefined);

/**
 * A permission as a screen follows it: read when the screen mounts and each time the app comes
 * back to the foreground — the person may have changed it in the system's settings —, and
 * never asked for by itself. Every screen that follows one kind shows the same status.
 */
export function usePermission(kind: EPermission): PermissionControl {
  const status = useSyncExternalStore(permissionStates.subscribe, () =>
    permissionStates.get(kind),
  );
  const [busy, setBusy] = useState(false);

  const check = useCallback(
    () => commonBoundedContext.execute(new CommandCheckPermission(kind)),
    [kind],
  );

  useEffect(() => {
    quietly(check());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") quietly(check());
    });
    return () => subscription.remove();
  }, [check]);

  const request = useCallback(() => {
    setBusy(true);
    return withCleanup(
      () => commonBoundedContext.execute(new CommandRequestPermission(kind)),
      () => setBusy(false),
    );
  }, [kind]);

  const openSettings = useCallback(() => {
    setBusy(true);
    return withCleanup(
      () => commonBoundedContext.execute(new CommandOpenPermissionSettings(kind)),
      () => setBusy(false),
    );
  }, [kind]);

  const act = useCallback(
    (action: PermissionAction) => (action === "settings" ? openSettings() : request()),
    [openSettings, request],
  );

  return { status, granted: status === "granted", busy, check, request, openSettings, act };
}
