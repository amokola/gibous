import { isIP } from 'node:net';

/** Trust forwarded addresses only when the direct TCP peer is an explicit trusted proxy. */
export function resolveWebSocketClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxyIps: ReadonlySet<string>,
): string {
  const remote = remoteAddress?.trim() || 'unknown';
  if (!trustedProxyIps.has(remote.toLowerCase()) || !forwardedFor) return remote;

  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const forwarded = header.split(',').map((value) => value.trim()).filter(Boolean);
  if (!forwarded.length || forwarded.some((ip) => isIP(ip) === 0)) return remote;

  const chain = [...forwarded, remote];
  for (let index = chain.length - 1; index > 0; index--) {
    const hop = chain[index].toLowerCase();
    if (trustedProxyIps.has(hop)) continue;
    return chain[index];
  }
  return chain[0];
}
