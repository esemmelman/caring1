import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
export const SESSION_SECONDS = 90 * 24 * 60 * 60;
function equal(a, b) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function signature(payload) {
  const key = Deno.env.get('CARING_SESSION_SECRET');
  if (!key) throw new Error('Session signing is not configured.');
  return createHmac('sha256', key).update(payload).digest('base64url');
}
export function authenticate(request, now = Math.floor(Date.now() / 1000)) {
  const credential = /^Bearer ([^\r\n]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const passcode = Deno.env.get('CARING_PASSCODE');
  if (!credential || credential.length > 1024 || !passcode) return null;
  if (equal(credential, passcode)) {
    const expiresAt = now + SESSION_SECONDS;
    const payload = Buffer.from(JSON.stringify({ exp: expiresAt, nonce: randomBytes(24).toString('base64url') })).toString('base64url');
    return { token: payload + '.' + signature(payload), expiresAt: expiresAt * 1000 };
  }
  try {
    const parts = credential.split('.');
    if (parts.length !== 2 || !equal(parts[1], signature(parts[0]))) return null;
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + SESSION_SECONDS) return null;
    return { token: credential, expiresAt: claims.exp * 1000 };
  } catch { return null; }
}
