/** Tempo mínimo de "digitando..." visível no WhatsApp do contacto. */
export const TYPING_DELAY_MS_MIN = 900;

/** Teto para mensagens muito longas (evita espera excessiva). */
export const TYPING_DELAY_MS_MAX = 14_000;

/** ~22 caracteres por segundo — ritmo humano de digitação. */
export const TYPING_DELAY_MS_PER_CHAR = 48;

export function isTypingDelayEnabled(): boolean {
  const v = process.env.WHATSAPP_TYPING_DELAY?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

/** Duração do indicador «digitando...» antes de enviar o texto. */
export function computeTypingDelayMs(text: string): number {
  const len = String(text ?? '').trim().length;
  if (len === 0) return TYPING_DELAY_MS_MIN;
  const estimated = TYPING_DELAY_MS_MIN + len * TYPING_DELAY_MS_PER_CHAR;
  return Math.min(TYPING_DELAY_MS_MAX, Math.max(TYPING_DELAY_MS_MIN, estimated));
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
