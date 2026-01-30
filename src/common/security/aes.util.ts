import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKeyFromHex(): Buffer {
  const hex = process.env.PROVIDER_ENC_KEY;
  if (!hex) {
    throw new Error('PROVIDER_ENC_KEY is missing in environment');
  }
  if (hex.length !== 64) {
    throw new Error('PROVIDER_ENC_KEY must be 32-byte hex (64 hex chars)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToBase64(plainText: string): string {
  const key = getKeyFromHex();
  const iv = randomBytes(12); // GCM recommended IV length
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // format: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptFromBase64(encB64: string): string {
  const key = getKeyFromHex();
  const buf = Buffer.from(encB64, 'base64');

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
