import { HttpException, HttpStatus } from '@nestjs/common';

/** Justificativa ao encerrar OS como ganho ou perda. */
export const TICKET_RESOLUTION_REASON_MIN = 10;
export const TICKET_RESOLUTION_REASON_MAX = 500;

const RESOLUTIONS_REQUIRING_REASON = new Set(['SUCCESS', 'CANCELLED']);

export function assertResolutionReasonWhenArchiving(
  isArchived: boolean,
  resolution?: string,
  resolutionReason?: string,
): string | undefined {
  if (!isArchived) return undefined;

  const res = resolution ? String(resolution).trim().toUpperCase() : '';
  if (!RESOLUTIONS_REQUIRING_REASON.has(res)) {
    return resolutionReason !== undefined ? String(resolutionReason).trim() : undefined;
  }

  const label =
    res === 'SUCCESS'
      ? 'Justificativa do ganho'
      : res === 'CANCELLED'
        ? 'Justificativa da perda'
        : 'Justificativa do encerramento';

  const text = resolutionReason !== undefined ? String(resolutionReason).trim() : '';
  if (!text) {
    throw new HttpException(`O campo «${label}» é obrigatório.`, HttpStatus.BAD_REQUEST);
  }
  if (text.length < TICKET_RESOLUTION_REASON_MIN) {
    throw new HttpException(
      `O campo «${label}» deve ter pelo menos ${TICKET_RESOLUTION_REASON_MIN} caracteres.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  if (text.length > TICKET_RESOLUTION_REASON_MAX) {
    throw new HttpException(
      `O campo «${label}» não pode exceder ${TICKET_RESOLUTION_REASON_MAX} caracteres.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return text;
}
