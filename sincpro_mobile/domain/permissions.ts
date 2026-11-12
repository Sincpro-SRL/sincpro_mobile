/** A permission the app asks the phone for. */
export enum EPermission {
  BLUETOOTH = "bluetooth",
  LOCATION = "location",
}

/**
 * Where a permission stands:
 * - `granted`;
 * - `denied`: not granted, and the system's dialog can still ask for it;
 * - `blocked`: only the system's settings grant it now (Android's «don't ask again», iOS after a
 *   denial);
 * - `unavailable`: this phone or platform does not have it (Bluetooth on the web).
 */
export type PermissionStatus = "granted" | "denied" | "blocked" | "unavailable";

/**
 * The phone's permissions — the port a use case holds (`this.permissions`): read without asking,
 * asked with the system's dialog, granted in the system's settings.
 */
export interface DevicePermissions {
  /** Where it stands now; never shows a dialog. */
  check(kind: EPermission): Promise<PermissionStatus>;
  /** Shows the system's dialog and answers what the person chose. */
  request(kind: EPermission): Promise<PermissionStatus>;
  /** Opens this app's page in the system's settings. */
  openSettings(): Promise<void>;
}

/** What the app last learned of each permission, for whoever shows it. */
export interface PermissionStates {
  get(kind: EPermission): PermissionStatus | undefined;
  set(kind: EPermission, status: PermissionStatus): void;
  subscribe(listener: () => void): () => void;
}
