import { ERemoteState, RemoteEntity } from "./entity";

const acceptedWrites = new WeakSet<RemoteEntity>();

export function acceptNextWrite(entity: RemoteEntity, remoteId?: number): void {
  if (remoteId !== undefined) entity.remoteId = remoteId;
  acceptedWrites.add(entity);
}

export function takeAcceptedWrite(entity: RemoteEntity): boolean {
  if (!acceptedWrites.has(entity)) return false;
  acceptedWrites.delete(entity);
  return true;
}

export function applyAcknowledgement(entity: RemoteEntity, remoteId?: number): void {
  if (remoteId !== undefined) entity.remoteId = remoteId;
  entity.ackedVersion = entity.version;
  entity.remoteState = ERemoteState.SYNCED;
}
