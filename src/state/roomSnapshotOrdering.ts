export interface VersionedRoomIdentity {
  code: string;
  version: number;
}

/** Versions are only comparable within the same room, since rematches reset them. */
export function shouldApplyRoomSnapshot(
  currentRoom: VersionedRoomIdentity | null | undefined,
  incomingRoom: VersionedRoomIdentity,
): boolean {
  return !currentRoom || currentRoom.code !== incomingRoom.code || incomingRoom.version >= currentRoom.version;
}
