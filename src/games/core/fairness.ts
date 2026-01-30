import { createHmac, createHash, randomBytes } from 'crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function newServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export function hmac256Hex(key: string, msg: string): string {
  return createHmac('sha256', key).update(msg).digest('hex');
}

/**
 * Deterministic uniform [0,1) derived from serverSeed, clientSeed, nonce, and tag.
 */
export function fairnessU01(serverSeed: string, clientSeed: string, nonce: number, tag: string): number {
  const h = hmac256Hex(serverSeed, `${clientSeed}:${nonce}:${tag}`);
  // take 52 bits for double mantissa
  const slice = h.slice(0, 13); // 13 hex = 52 bits
  const n = BigInt('0x' + slice);
  const max = 2n ** 52n;
  return Number(n) / Number(max);
}
