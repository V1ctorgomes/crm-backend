import { Prisma } from '@prisma/client';
import { DeletionResourceType } from '../deletion-audit.constants';

/** Janela em que o admin pode reverter uma exclusão auditada (qualquer perfil que a tenha feito). */
export const DELETION_REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** @deprecated Use DELETION_REVERT_WINDOW_MS */
export const USER_DELETION_REVERT_WINDOW_MS = DELETION_REVERT_WINDOW_MS;

export const SUPPORTED_REVERT_TYPES = new Set<string>([
  DeletionResourceType.TICKET_NOTE,
  DeletionResourceType.TICKET_TASK,
  DeletionResourceType.TICKET_STAGE,
  DeletionResourceType.TICKET,
  DeletionResourceType.CONTACT_COMPANY_LINK,
  DeletionResourceType.COMPANY,
  DeletionResourceType.CONTACT,
  DeletionResourceType.WHATSAPP_MESSAGE,
  DeletionResourceType.INSTANCE,
]);

function withinRevertWindow(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() <= DELETION_REVERT_WINDOW_MS;
}

export function revertBlockReason(row: {
  revertedAt: Date | null;
  createdAt: Date;
  snapshot: Prisma.JsonValue | null;
  resourceType: string;
}): string | null {
  if (row.revertedAt) return 'Já foi restaurado.';
  if (!withinRevertWindow(row.createdAt)) {
    return 'Passou o prazo de 24 horas para restaurar.';
  }
  if (row.snapshot === null || row.snapshot === undefined) {
    return 'Não há cópia dos dados gravada para esta exclusão.';
  }
  if (!SUPPORTED_REVERT_TYPES.has(row.resourceType)) {
    return 'Este tipo de exclusão não pode ser restaurado automaticamente.';
  }
  return null;
}
