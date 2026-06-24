import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAccessService } from './ticket-access.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';

@Injectable()
export class TicketStagesService {
  constructor(
    private prisma: PrismaService,
    private ticketAccess: TicketAccessService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async getAllStages(userId: string) {
    await this.ticketAccess.ensureDefaultStages(userId);
    return this.prisma.stage.findMany({ where: { userId }, orderBy: { order: 'asc' } });
  }

  async createStage(userId: string, name: string, color: string) {
    const count = await this.prisma.stage.count({ where: { userId } });
    return this.prisma.stage.create({ data: { userId, name, color: color || '#e2e8f0', order: count + 1 } });
  }

  async updateStage(userId: string, id: string, data: { name?: string; color?: string; isActive?: boolean }) {
    await this.ticketAccess.ensureStageOwner(userId, id);
    return this.prisma.stage.update({ where: { id }, data });
  }

  async deleteStage(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id, userId },
      select: { id: true, userId: true, name: true, color: true, order: true, isActive: true },
    });
    if (!stage) {
      throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
    }

    const activeOnStage = await this.prisma.ticket.count({
      where: { userId, stageId: id, isArchived: false },
    });
    if (activeOnStage > 0) {
      throw new HttpException(
        'Não é possível apagar uma fase que ainda contém solicitações ativas. Mova ou arquive todas as OS desta fase antes de apagar.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const linked = await tx.ticket.count({ where: { userId, stageId: id } });
        if (linked > 0) {
          const fallback = await tx.stage.findFirst({
            where: { userId, id: { not: id } },
            orderBy: { order: 'asc' },
            select: { id: true },
          });
          if (!fallback) {
            throw new HttpException(
              'Não é possível apagar esta fase: ainda há solicitações arquivadas nela e não existe outra fase para reatribuí-las. Crie outra fase ou altere a fase dessas OS nos arquivados.',
              HttpStatus.BAD_REQUEST,
            );
          }
          await tx.ticket.updateMany({
            where: { userId, stageId: id },
            data: { stageId: fallback.id },
          });
        }
        const deleted = await tx.stage.delete({ where: { id } });
        await this.deletionAudit.record(tx, actor, {
          resourceType: DeletionResourceType.TICKET_STAGE,
          resourceId: id,
          rawReason,
          snapshot: stage,
        });
        return deleted;
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          throw new HttpException(
            'Não é possível apagar esta fase: ainda existem solicitações ou dados ligados a ela. Mova as OS para outra fase e tente novamente.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (e.code === 'P2025') {
          throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
        }
      }
      throw e;
    }
  }

  async reorderStages(userId: string, stages: { id: string; order: number }[]) {
    const ids = stages.map((s) => s.id);
    const owned = await this.prisma.stage.count({ where: { userId, id: { in: ids } } });
    if (owned !== ids.length) {
      throw new HttpException('Fases inválidas.', HttpStatus.BAD_REQUEST);
    }
    const updates = stages.map(s => this.prisma.stage.update({ where: { id: s.id }, data: { order: s.order } }));
    return this.prisma.$transaction(updates);
  }
}
