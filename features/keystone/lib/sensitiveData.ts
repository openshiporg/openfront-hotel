import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = process.env.HOTEL_DATA_ENCRYPTION_KEY || (process.env.NODE_ENV === 'production' ? '' : 'local-hotel-data-encryption-key-change-me');
  if (secret.length < 32) throw new Error('Hotel data encryption is not configured.');
  return createHash('sha256').update(secret).digest();
}

export function encryptSensitiveText(value: unknown) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('enc:v1:')) return text;
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSensitiveText(value: unknown) {
  const text = String(value || '');
  if (!text.startsWith('enc:v1:')) return text;
  const [, , iv, tag, encrypted] = text.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
