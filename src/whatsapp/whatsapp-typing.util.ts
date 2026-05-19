/** Duração de cada pulso «digitando…» / «a gravar…» na Evolution (ms). */
export const PRESENCE_PULSE_MS = 5500;

export function isTypingDelayEnabled(): boolean {
  const v = process.env.WHATSAPP_TYPING_DELAY?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

export type ChatPresenceType = 'composing' | 'recording';
