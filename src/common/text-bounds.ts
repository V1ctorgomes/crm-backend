import { BadRequestException } from '@nestjs/common';

/** Notas, títulos de tarefa, nomes curtos. */
export const CRM_TEXT_SHORT_MAX = 500;

/** Texto de mensagem WhatsApp (limite da API). */
export const WHATSAPP_MESSAGE_TEXT_MAX = 4096;

/** Legenda de mídia WhatsApp. */
export const WHATSAPP_CAPTION_MAX = 1024;

/** Motivo de eliminação (auditoria). */
export const DELETE_REASON_MAX_LEN = 2000;

export function assertBoundedText(
  raw: unknown,
  label: string,
  max: number,
  options?: { min?: number; required?: boolean },
): string {
  const min = options?.min ?? 0;
  const required = options?.required ?? true;
  const text = String(raw ?? '').trim();
  if (!text && !required) return '';
  if (!text && required) {
    throw new BadRequestException(`O campo «${label}» é obrigatório.`);
  }
  if (text.length < min) {
    throw new BadRequestException(
      `O campo «${label}» deve ter pelo menos ${min} caracteres.`,
    );
  }
  if (text.length > max) {
    throw new BadRequestException(
      `O campo «${label}» não pode exceder ${max} caracteres.`,
    );
  }
  return text;
}

export function assertOptionalBoundedText(
  raw: unknown,
  label: string,
  max: number,
): string | undefined {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  if (text.length > max) {
    throw new BadRequestException(
      `O campo «${label}» não pode exceder ${max} caracteres.`,
    );
  }
  return text;
}
