import { decryptSensitiveText, encryptSensitiveText } from './sensitiveData';

export function encryptChannelCredentials(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Channel credentials must be an object.');
  const object = value as Record<string, unknown>;
  if (typeof object.encrypted === 'string' && object.encrypted.startsWith('enc:v1:')) return object;
  return { encrypted: encryptSensitiveText(JSON.stringify(object)) };
}

export function readChannelCredentials(channel: { credentials?: unknown }): Record<string, any> {
  const stored = channel.credentials as any;
  if (!stored || typeof stored.encrypted !== 'string' || !stored.encrypted.startsWith('enc:v1:')) {
    throw new Error('Channel credentials must be encrypted through property channel configuration before use.');
  }
  const parsed = JSON.parse(decryptSensitiveText(stored.encrypted));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid encrypted channel credentials.');
  return parsed;
}
