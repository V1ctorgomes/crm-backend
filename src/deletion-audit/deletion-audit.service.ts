import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditActor } from './delete-reason.util';
import { normalizeDeletionReason } from './delete-reason.util';

@Injectable()
export class DeletionAuditService {
  private readonly logger = new Logger(DeletionAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toSnapshotJson(snapshot: unknown): Prisma.InputJsonValue | undefined {
    if (snapshot === undefined || snapshot === null) return undefined;
    try {
      return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
    } catch (e) {
      this.logger.warn(`Snapshot não serializável, a gravar resumo mínimo: ${String(e)}`);
      return { _error: 'snapshot_serialization_failed' } as Prisma.InputJsonValue;
    }
  }

  /** Grava auditoria (use dentro de `$transaction` com `tx` para atomicidade com o delete). */
  async record(
    db: Pick<PrismaService, 'deletionAudit'>,
    actor: AuditActor,
    input: {
      resourceType: string;
      resourceId: string;
      rawReason?: string;
      snapshot?: unknown;
    },
  ): Promise<void> {
    const reason = normalizeDeletionReason(actor.role, input.rawReason);
    const snapshotJson = this.toSnapshotJson(input.snapshot);
    await db.deletionAudit.create({
      data: {
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        reason,
        ...(snapshotJson !== undefined ? { snapshot: snapshotJson } : {}),
      },
    });
  }
}
