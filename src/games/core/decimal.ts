/**
 * Lightweight decimal helpers (string-based, 6 dp) to avoid float errors.
 * Uses fixed scale integers (micro units).
 */
const SCALE = 1_000_000n;

export function decToInt(value: string): bigint {
  const v = value.trim();
  const neg = v.startsWith('-');
  const s = neg ? v.slice(1) : v;
  const [a, bRaw = ''] = s.split('.');
  const b = (bRaw + '000000').slice(0, 6);
  const i = BigInt(a || '0') * SCALE + BigInt(b);
  return neg ? -i : i;
}

export function intToDec(value: bigint): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const a = v / SCALE;
  const b = v % SCALE;
  const bStr = b.toString().padStart(6, '0').replace(/0+$/, '');
  const out = bStr.length ? `${a.toString()}.${bStr}` : a.toString();
  return neg ? `-${out}` : out;
}

export function decAdd(a: string, b: string): string {
  return intToDec(decToInt(a) + decToInt(b));
}

export function decSub(a: string, b: string): string {
  return intToDec(decToInt(a) - decToInt(b));
}

export function decMul(a: string, m: number): string {
  const ai = decToInt(a);
  const mi = BigInt(Math.round(m * 1_000_000));
  // (ai * mi) / SCALE
  const r = (ai * mi) / SCALE;
  return intToDec(r);
}

export function decMax(a: string, b: string): string {
  return decToInt(a) >= decToInt(b) ? a : b;
}

export function decZero(): string {
  return '0';
}
