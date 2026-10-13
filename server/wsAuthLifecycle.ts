import { WebSocket } from 'ws';

/** Complete any slow identity reads before mutating live session state. */
export async function completeAuthAfterStorage<T>(
  ws: WebSocket,
  isInvalidated: () => boolean,
  loadIdentity: () => Promise<T>,
  registerSession: (identity: T) => void,
): Promise<boolean> {
  const identity = await loadIdentity();
  if (isInvalidated() || ws.readyState !== WebSocket.OPEN) return false;

  registerSession(identity);
  return true;
}
