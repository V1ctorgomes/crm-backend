import { BadRequestException } from '@nestjs/common';
import { DELETE_REASON_MIN_LEN } from './deletion-audit.constants';

export type AuditActor = { userId: string; email: string; role: string };

/** Normaliza e valida o motivo; developers podem omitir (valor sentinela). */
export function normalizeDeletionReason(actorRole: string, raw?: string): string {
  const t = String(raw ?? '').trim();
  if (actorRole === 'DEVELOPER') {
    return t.length > 0 ? t : '[Developer — motivo opcional]';
  }
  if (t.length < DELETE_REASON_MIN_LEN) {
    throw new BadRequestException(
      `Indique o motivo da eliminação (mínimo ${DELETE_REASON_MIN_LEN} caracteres).`,
    );
  }
  return t;
}
