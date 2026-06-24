import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { sanitizeContactUpdate } from './contact-update.validation';
import {
  contactNumberLookupVariants,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';

@Injectable()
export class ContactsListService {
  constructor(
    private readonly prisma: PrismaService,
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
