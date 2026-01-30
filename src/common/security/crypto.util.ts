import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  pbkdf2Sync,
} from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(payload, 'utf8')
    .digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

export function hashSecret(secret: string): string {
  // PBKDF2 for operator secret storage
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(secret, salt, 120_000, 32, 'sha256');
  return `pbkdf2$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;

  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = pbkdf2Sync(secret, salt, 120_000, 32, 'sha256');

  return timingSafeEqual(expected, derived);
}
