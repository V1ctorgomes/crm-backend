import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'crm-field-salt-v1', 32);
}

function encryptionSecret(): string | null {
  const s = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return s && s.length >= 32 ? s : null;
}

/** Encripta segredos em repouso (proxy, API keys). Sem chave configurada, grava em texto claro (só dev). */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const secret = encryptionSecret();
  if (!secret) return String(plain);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

/** Desencripta ou devolve valor legado em texto claro. */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return null;
  const v = String(stored);
  if (!v.startsWith(PREFIX)) return v;
  const secret = encryptionSecret();
  if (!secret) {
    throw new Error('FIELD_ENCRYPTION_KEY em falta para ler segredos encriptados.');
  }
  const body = v.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
  return dec.toString('utf8');
}

export function isFieldEncryptionEnabled(): boolean {
  return encryptionSecret() != null;
}
