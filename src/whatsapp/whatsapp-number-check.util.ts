export function isWhatsAppNumberCheckEnabled(): boolean {
  const v = process.env.WHATSAPP_NUMBER_CHECK_ENABLED?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

/** Interpreta resposta de `POST /chat/whatsappNumbers/{instance}`. */
export function parseWhatsAppExistsResult(data: unknown, digits: string): boolean | null {
  if (!data) return null;
  const normalized = digits.replace(/\D/g, '');
  if (!normalized) return null;

  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rowNum = String(row.number ?? row.phone ?? '').replace(/\D/g, '');
    if (rowNum && rowNum !== normalized) continue;
    if (typeof row.exists === 'boolean') return row.exists;
    if (row.jid && String(row.jid).includes('@')) return true;
  }
  return null;
}
