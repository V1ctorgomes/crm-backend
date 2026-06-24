import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import {
  contactNumberLookupVariants,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';

@Injectable()
export class ContactsHistoryService {
  private readonly logger = new Logger(ContactsHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly deletionAudit: DeletionAuditService,
  ) {}

  async getChatHistory(
    userId: string,
    number: string,
    opts?: { limit?: number; beforeMessageId?: string },
  ) {
    const contactNumber = normalizeStoredContactKey(String(number || '').trim());
    const msgVariants = contactNumberLookupVariants(contactNumber);
    const msgWhere =
      msgVariants.length === 1
        ? { userId, contactNumber }
        : { userId, OR: msgVariants.map((cn) => ({ contactNumber: cn })) };

    const rawLimit = opts?.limit ?? 80;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 80, 1), 200);
    const take = limit + 1;
    const beforeId = opts?.beforeMessageId?.trim();

    try {
      if (beforeId) {
        const cursor = await this.prisma.message.findFirst({
          where: { ...msgWhere, id: beforeId },
          select: { id: true, timestamp: true },
        });
        if (!cursor) {
          return { messages: [], hasMoreOlder: false };
        }
        const older = await this.prisma.message.findMany({
          where: {
            AND: [
              msgWhere,
              {
                OR: [
                  { timestamp: { lt: cursor.timestamp } },
                  { AND: [{ timestamp: cursor.timestamp }, { id: { lt: cursor.id } }] },
                ],
              },
            ],
          },
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take,
        });
        const hasMoreOlder = older.length > limit;
        const page = hasMoreOlder ? older.slice(0, limit) : older;
        return { messages: page.reverse(), hasMoreOlder };
      }

      const recent = await this.prisma.message.findMany({
        where: msgWhere,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take,
      });
      const hasMoreOlder = recent.length > limit;
      const page = hasMoreOlder ? recent.slice(0, limit) : recent;
      return { messages: page.reverse(), hasMoreOlder };
    } catch {
      return { messages: [], hasMoreOlder: false };
    }
  }

  async deleteConversation(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    const contactNumber = normalizeStoredContactKey(String(number || '').trim());
    const msgVariants = contactNumberLookupVariants(contactNumber);
    const msgWhere =
      msgVariants.length === 1
        ? { userId, contactNumber }
        : { userId, OR: msgVariants.map((cn) => ({ contactNumber: cn })) };
    try {
      const conversasPrefix = this.r2Service.conversasPath(userId, contactNumber);
      await this.r2Service.deleteFolder(conversasPrefix);

      const messageCount = await this.prisma.message.count({ where: msgWhere });
      const contactRow = await this.prisma.contact.findUnique({
        where: { number_userId: { number: contactNumber, userId } },
        select: {
          number: true,
          name: true,
          instanceName: true,
          lastMessage: true,
          lastMessageTime: true,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.message.deleteMany({
          where: msgWhere,
        });
        await this.deletionAudit.record(tx, actor, {
          resourceType: DeletionResourceType.WHATSAPP_CONVERSATION,
          resourceId: contactNumber,
          rawReason,
          snapshot: { contactNumber, messagesRemoved: messageCount, contact: contactRow },
        });
      });

      try {
        await this.prisma.contact.update({
          where: { number_userId: { number: contactNumber, userId } },
          data: { lastMessage: '', lastMessageTime: null },
        });
      } catch {
        /* contacto pode não existir */
      }

      return { success: true };
    } catch (e) {
      this.logger.error('Erro ao excluir conversa', e);
      throw new HttpException('Erro ao excluir', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
