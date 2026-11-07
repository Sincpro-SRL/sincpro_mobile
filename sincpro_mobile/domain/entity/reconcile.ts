import { RemoteEntity } from "./entity";
import { acceptNextWrite } from "./remote_sync";

export type ReconciliationWrite = "insert" | "replace" | "keep";

export interface Reconciliation<T extends RemoteEntity> {
  entity: T;
  write: ReconciliationWrite;
}

export function reconcile<T extends RemoteEntity>(
  local: T | null,
  incoming: T,
): Reconciliation<T> {
  if (!local) {
    acceptNextWrite(incoming, incoming.remoteId);
    return { entity: incoming, write: "insert" };
  }
  if (local.isDirty) return { entity: local, write: "keep" };
  local.mergeWithRemote(incoming);
  acceptNextWrite(local, incoming.remoteId ?? local.remoteId);
  return { entity: local, write: "replace" };
}
