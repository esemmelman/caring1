import { timingSafeEqual } from 'node:crypto';

export function validPasscode(request: Request) {
  const expected = Deno.env.get('CARING_PASSCODE');
  const match = /^Bearer ([^\r\n]+)$/.exec(request.headers.get('authorization') ?? '');
  if (!expected || !match || match[1].length > 128) return false;
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(match[1]);
  const expectedBytes = encoder.encode(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
