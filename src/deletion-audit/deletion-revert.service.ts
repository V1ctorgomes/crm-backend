import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DeletionResourceType } from './deletion-audit.constants';
import { PrismaService } from '../prisma/prisma.service';
import { InstanceRevertService } from './revert/instance-revert.service';
import { RevertDispatcherService } from './revert/revert-dispatcher.service';
import {
  DELETION_REVERT_WINDOW_MS,
  USER_DELETION_REVERT_WINDOW_MS,
  revertBlockReason,
} from './revert/revert-policy';

export { DELETION_REVERT_WINDOW_MS, USER_DELETION_REVERT_WINDOW_MS };

@Injectable()
export class DeletionRevertService {
  private readonly logger = new Logger(DeletionRevertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: RevertDispatcherService,
    private readonly instanceRevert: InstanceRevertService,
  ) {}

  async listRecentUserDeletions() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.deletionAudit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        actorEmail: true,
        actorRole: true,
        resourceType: true,
        resourceId: true,
        reason: true,
        revertedAt: true,
        revertedByUserId: true,
        snapshot: true,
      },
    });

    const items = rows.map((r) => {
      const block = revertBlockReason(r);
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorUserId: r.actorUserId,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        reason: r.reason,
        revertedAt: r.revertedAt?.toISOString() ?? null,
        revertedByUserId: r.revertedByUserId,
        canRevert: block === null,
        revertBlockedReason: block,
      };
    });

    return { items, revertibleCount: items.filter((i) => i.canRevert).length };
  }

  async revertUserDeletion(auditId: string, adminUserId: string) {
    const row = await this.prisma.deletionAudit.findUnique({ where: { id: auditId } });
    if (!row) {
      throw new HttpException('Registo de exclusão não encontrado.', HttpStatus.NOT_FOUND);
    }
    const block = revertBlockReason(row);
    if (block) {
      throw new HttpException(block, HttpStatus.BAD_REQUEST);
    }

    try {
      if (row.resourceType === DeletionResourceType.INSTANCE) {
        await this.instanceRevert.revertInstanceWithEvolution(row.snapshot, auditId, adminUserId);
        return { success: true };
      }

      await this.prisma.$transaction(async (tx) => {
        await this.dispatcher.applyRevert(tx, row.resourceType, row.snapshot);
        await tx.deletionAudit.update({
          where: { id: auditId },
          data: { revertedAt: new Date(), revertedByUserId: adminUserId },
        });
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`Falha ao reverter auditoria ${auditId}: ${String(e)}`);
      throw new HttpException(
        e instanceof Error ? e.message : 'Não foi possível restaurar este registo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { success: true };
  }
}
