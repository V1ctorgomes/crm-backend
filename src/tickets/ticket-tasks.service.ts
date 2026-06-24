import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAccessService } from './ticket-access.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertBoundedText, CRM_TEXT_SHORT_MAX } from '../common/text-bounds';

@Injectable()
export class TicketTasksService {
  constructor(
    private prisma: PrismaService,
    private ticketAccess: TicketAccessService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async addTask(userId: string, ticketId: string, title: string, dueDate: string) {
    await this.ticketAccess.ensureTicketOwner(userId, ticketId);
    const safeTitle = assertBoundedText(title, 'Título da tarefa', CRM_TEXT_SHORT_MAX, { min: 1 });
    const due = new Date(String(dueDate ?? ''));
    if (Number.isNaN(due.getTime())) {
      throw new HttpException('Data de vencimento inválida.', HttpStatus.BAD_REQUEST);
    }
    return this.prisma.task.create({
      data: {
        ticketId,
        title: safeTitle,
        dueDate: due,
      },
    });
  }

  async toggleTask(userId: string, id: string, isCompleted: boolean) {
    const task = await this.prisma.task.findFirst({ where: { id, ticket: { userId } } });
    if (!task) throw new HttpException('Tarefa não encontrada.', HttpStatus.NOT_FOUND);
    return this.prisma.task.update({ where: { id }, data: { isCompleted } });
  }

  async deleteTask(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    const task = await this.prisma.task.findFirst({ where: { id, ticket: { userId } } });
    if (!task) throw new HttpException('Tarefa não encontrada.', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.TICKET_TASK,
        resourceId: id,
        rawReason,
        snapshot: task,
      });
    });
    return { success: true };
  }
}
