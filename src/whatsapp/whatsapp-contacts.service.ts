import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { sanitizeContactUpdate } from './contact-update.validation';
import {
  contactNumberLookupVariants,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappContactsService {
  private readonly logger = new Logger(WhatsappContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly deletionAudit: DeletionAuditService,
  ) {}

  async getContacts(userId: string) {
    try {
      const rows = await this.prisma.contact.findMany({
        where: { userId },
        orderBy: { lastMessageTime: 'desc' },
        include: { companyLinks: { include: { company: true } } },
      });
      return rows.map(({ companyLinks, ...c }) => ({
        ...c,
        companies: (companyLinks || []).map((l) => ({
          id: l.company.id,
          legalName: l.company.legalName,
          tradeName: l.company.tradeName,
          cnpj: l.company.cnpj,
        })),
      }));
    } catch {
      return [];
    }
  }

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

  async updateContact(userId: string, number: string, data: Record<string, unknown>) {
    const contactKey = normalizeStoredContactKey(String(number || '').trim());
    const sanitized = sanitizeContactUpdate(data);
    const updateData: Record<string, unknown> = {};
    if (sanitized.name !== undefined) updateData.name = sanitized.name;
    if (sanitized.email !== undefined) updateData.email = sanitized.email;
    if (sanitized.cpf !== undefined) updateData.cnpj = sanitized.cpf;
    if (data.contactKind !== undefined && data.contactKind !== null) {
      const k = String(data.contactKind).toUpperCase();
      if (k === 'UNKNOWN' || k === 'CUSTOMER' || k === 'INTERNAL') {
        updateData.contactKind = k;
      }
    }
    if (Object.keys(updateData).length === 0) {
      return await this.prisma.contact.findUniqueOrThrow({
        where: { number_userId: { number: contactKey, userId } },
      });
    }
    return await this.prisma.contact.update({
      where: { number_userId: { number: contactKey, userId } },
      data: updateData as any,
    });
  }

  async removeContact(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    const contactKey = normalizeStoredContactKey(String(number || '').trim());
    const contact = await this.prisma.contact.findUnique({
      where: { number_userId: { number: contactKey, userId } },
      include: { tickets: true },
    });

    if (!contact) {
      throw new HttpException('Contato não encontrado.', HttpStatus.NOT_FOUND);
    }

    if (contact.tickets && contact.tickets.length > 0) {
      throw new HttpException(
        'Este contato possui solicitações (OS) no Kanban e não pode ser excluído.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const snapshot = { ...contact, tickets: (contact.tickets || []).map((t) => ({ id: t.id })) };

    await this.prisma.$transaction(async (tx) => {
      await tx.contact.delete({
        where: { number_userId: { number: contactKey, userId } },
      });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.CONTACT,
        resourceId: contactKey,
        rawReason,
        snapshot,
      });
    });
    return { success: true };
  }

  async refreshContactLastMessage(userId: string, contactNumber: string) {
    const variants = contactNumberLookupVariants(contactNumber);
    const canonical = normalizeStoredContactKey(contactNumber);
    const msgWhere =
      variants.length === 1
        ? { userId, contactNumber: variants[0] }
        : { userId, OR: variants.map((cn) => ({ contactNumber: cn })) };
    const last = await this.prisma.message.findFirst({
      where: msgWhere,
      orderBy: { timestamp: 'desc' },
    });
    const preview = last?.text?.trim() || (last?.isMedia ? 'Mídia' : '') || '';
    try {
      await this.prisma.contact.update({
        where: { number_userId: { number: canonical, userId } },
        data: {
          lastMessage: preview,
          lastMessageTime: last?.timestamp ?? null,
        },
      });
    } catch {
      /* contato pode não existir */
    }
  }
}
