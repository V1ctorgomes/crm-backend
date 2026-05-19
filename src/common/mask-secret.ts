/** Valor enviado pelo cliente quando o segredo não foi alterado. */
export const MASKED_SECRET_PLACEHOLDER = '••••••••';

export function maskSecret(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const v = String(value);
  if (v.length <= 4) return MASKED_SECRET_PLACEHOLDER;
  return `${MASKED_SECRET_PLACEHOLDER}${v.slice(-4)}`;
}

export function isMaskedSecretInput(value: unknown): boolean {
  if (value == null || value === '') return true;
  const s = String(value);
  return s.startsWith(MASKED_SECRET_PLACEHOLDER) || s === '********';
}
