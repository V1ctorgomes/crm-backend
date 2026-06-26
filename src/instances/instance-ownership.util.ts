import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Instance } from '@prisma/client';

export function assertInstanceUserIdParam(requestedUserId: string, actorUserId: string): void {
  if (requestedUserId !== actorUserId) {
    throw new ForbiddenException('Sem permissão para aceder a instâncias de outro utilizador.');
  }
}

export function assertInstanceOwned(instance: Instance | null, actorUserId: string): Instance {
  if (!instance) {
    throw new NotFoundException('Instância não encontrada.');
  }
  if (instance.userId !== actorUserId) {
    throw new ForbiddenException('Sem permissão para esta instância.');
  }
  return instance;
}
