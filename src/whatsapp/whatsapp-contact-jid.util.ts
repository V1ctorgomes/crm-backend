/** Janelas de tempo alinhadas ao WhatsApp (apagar / editar). */
export const WA_DELETE_MAX_MS = 50 * 60 * 60 * 1000;
export const WA_EDIT_MAX_MS = 14 * 60 * 1000;

export function buildScopedMessageId(userId: string, waId: string): string {
  return `${userId}:${waId}`;
}

export function extractWaMessageId(userId: string, storedMessageId: string): string | null {
  const prefix = `${userId}:`;
  if (storedMessageId.startsWith(prefix)) return storedMessageId.slice(prefix.length);
  return null;
}

export function isGroupRemoteJid(remoteJid: string): boolean {
  return String(remoteJid || '').toLowerCase().endsWith('@g.us');
}

/** Chave única na BD: JID do grupo em minúsculas; 1:1 só com dígitos. */
export function normalizeStoredContactKey(key: string): string {
  const k = String(key || '').trim();
  if (!k) return k;
  if (k.toLowerCase().endsWith('@g.us')) return k.toLowerCase();
  const beforeAt = k.split('@')[0] || k;
  return beforeAt.replace(/\D/g, '');
}

export function contactKeyFromRemoteJid(remoteJid: string): string {
  const raw = String(remoteJid || '').trim();
  if (isGroupRemoteJid(raw)) return raw.toLowerCase();
  return raw.split('@')[0].replace(/\D/g, '');
}

/** Valor do campo `number` nos pedidos à Evolution. */
export function evolutionSendNumber(contactKey: string): string {
  const k = String(contactKey || '').trim();
  if (k.toLowerCase().endsWith('@g.us')) return k;
  return k.replace(/\D/g, '');
}

export function buildRemoteJid(contactNumber: string): string {
  const k = String(contactNumber || '').trim();
  if (k.toLowerCase().endsWith('@g.us')) return k.toLowerCase();
  const digits = k.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Variantes da chave do contacto (ex.: @G.us vs @g.us). */
export function contactNumberLookupVariants(contactNumber: string): string[] {
  const k = String(contactNumber || '').trim();
  if (!k.toLowerCase().endsWith('@g.us')) {
    return [normalizeStoredContactKey(k)];
  }
  const lower = k.toLowerCase();
  return [...new Set([lower, k, lower.replace(/@g\.us$/, '@G.us')])];
}

export function sanitizeWhatsAppGroupSubject(candidate: string | undefined, groupJid: string): string | undefined {
  const s = typeof candidate === 'string' ? candidate.trim() : '';
  if (!s) return undefined;
  const gj = String(groupJid || '').trim().toLowerCase();
  if (s.toLowerCase() === gj) return undefined;
  if (s.toLowerCase().endsWith('@g.us')) return undefined;
  if (s.toLowerCase().includes('@s.whatsapp.net')) return undefined;
  const onlyDigits = s.replace(/\D/g, '');
  if (onlyDigits.length >= 14 && onlyDigits === s.replace(/[^\d]/g, '')) return undefined;
  return s;
}

export function shouldReplaceAutoGroupDisplayName(name: string | null | undefined, groupJid: string): boolean {
  const n = String(name ?? '').trim();
  if (!n) return true;
  if (n.toLowerCase() === String(groupJid).trim().toLowerCase()) return true;
  if (n.toLowerCase().includes('@g.us')) return true;
  if (/^grupo\s*whatsapp\s*$/i.test(n)) return true;
  if (/^grupo\s*\(\d+\)\s*$/i.test(n)) return true;
  const digits = n.replace(/\D/g, '');
  if (digits.length >= 14 && digits === n.replace(/[^\d]/g, '')) return true;
  return false;
}
