import { hmac256Hex } from '../core/fairness';

/**
 * Provably fair crash:
 * - Compute hmac = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
 * - Take first 52 bits => r
 * - If r % 101 == 0 => instant bust at 1.00 (rare ~0.99%)
 * - Else multiplier = floor((100 * 2^52 - r) / (2^52 - r)) / 100
 * House edge applied by the modulo rule (standard crash approach).
 */
export function crashMultiplier(serverSeed: string, clientSeed: string, nonce: number): number {
  const h = hmac256Hex(serverSeed, `${clientSeed}:${nonce}`);
  const r = BigInt('0x' + h.slice(0, 13)); // 52 bits
  if (r % 101n === 0n) return 1.0;

  const e = 2n ** 52n;
  // m = (100*e - r)/(e-r)
  const num = 100n * e - r;
  const den = e - r;
  const mTimes100 = num / den;
  // clamp
  const m = Number(mTimes100) / 100;
  return Math.max(1.0, Math.min(m, 1000000));
}
