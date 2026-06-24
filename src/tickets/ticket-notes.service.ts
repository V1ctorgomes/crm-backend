import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAccessService } from './ticket-access.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertBoundedText, CRM_TEXT_SHORT_MAX } from '../common/text-bounds';

@Injectable()
export class TicketNotesService {
  constructor(
    private prisma: PrismaService,
    private ticketAccess: TicketAccessService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async addNote(userId: string, ticketId: string, text: string) {
    await this.ticketAccess.ensureTicketOwner(userId, ticketId);
    const safeText = assertBoundedText(text, 'Nota', CRM_TEXT_SHORT_MAX, { min: 1 });
    return this.prisma.note.create({ data: { ticketId, text: safeText } });
  }

  async deleteNote(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    const note = await this.prisma.note.findFirst({ where: { id, ticket: { userId } } });
    if (!note) throw new HttpException('Nota não encontrada.', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.note.delete({ where: { id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.TICKET_NOTE,
        resourceId: id,
        rawReason,
        snapshot: note,
      });
    });
    return { success: true };
  }
}
