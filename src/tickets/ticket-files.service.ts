import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { TicketAccessService } from './ticket-access.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertCrmUpload } from '../common/upload-media.validation';

@Injectable()
export class TicketFilesService {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private ticketAccess: TicketAccessService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async uploadTicketFile(userId: string, ticketId: string, file: any, description?: string) {
    assertCrmUpload(file, 'Ficheiro');
    await this.ticketAccess.ensureTicketOwner(userId, ticketId);

    const folder = this.r2Service.solicitacoesTicketPath(userId, ticketId);
    const fileUrl = await this.r2Service.uploadFile(file, folder);
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    return this.prisma.ticketFile.create({
      data: {
        ticketId,
        fileName: safeName,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
        description: description || null
      }
    });
  }

  async deleteTicketFile(userId: string, fileId: string, actor: AuditActor, rawReason?: string) {
    const file = await this.prisma.ticketFile.findFirst({
      where: { id: fileId, ticket: { userId } },
      include: { ticket: { select: { id: true, contactNumber: true } } },
    });
    if (file) {
      await this.r2Service.deleteFile(file.fileUrl);
      await this.prisma.$transaction(async (tx) => {
        await tx.ticketFile.delete({ where: { id: fileId } });
        await this.deletionAudit.record(tx, actor, {
          resourceType: DeletionResourceType.TICKET_FILE,
          resourceId: fileId,
          rawReason,
          snapshot: file,
        });
      });
    }
    return { success: true };
  }
}
