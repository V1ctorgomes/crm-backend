import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import {
  WA_DELETE_MAX_MS,
  WA_EDIT_MAX_MS,
  buildRemoteJid,
  buildScopedMessageId,
  contactNumberLookupVariants,
  evolutionSendNumber,
  extractWaMessageId,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappMessageActionsService {
  private readonly logger = new Logger(WhatsappMessageActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly deletionAudit: DeletionAuditService,
    private readonly contactsService: WhatsappContactsService,
  ) {}

  private async findUserMessageForAction(userId: string, contactNumber: string, messageId: string) {
    const ids = messageId.includes(':')
      ? [messageId]
      : [messageId, buildScopedMessageId(userId, messageId)];
    const variants = contactNumberLookupVariants(contactNumber);
    return this.prisma.message.findFirst({
      where: {
        userId,
        id: { in: ids },
        OR: variants.map((cn) => ({ contactNumber: cn })),
      },
    });
  }

  async deleteMessageForEveryone(
    userId: string,
    dto: { contactNumber: string; messageId: string; instanceName?: string; reason?: string },
    actor: AuditActor,
  ) {
    const contactNumber = normalizeStoredContactKey(String(dto.contactNumber || '').trim());
    const msg = await this.findUserMessageForAction(userId, contactNumber, dto.messageId);
    if (!msg) throw new HttpException('Mensagem não encontrada.', HttpStatus.NOT_FOUND);
    if (msg.type !== 'sent') {
      throw new HttpException('Só pode apagar mensagens enviadas por si.', HttpStatus.BAD_REQUEST);
    }

    const ageDeleteMs = Date.now() - msg.timestamp.getTime();
    if (ageDeleteMs < 0 || ageDeleteMs > WA_DELETE_MAX_MS) {
      throw new HttpException(
        'Só é possível apagar mensagens até 50 horas após o envio.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const waId = extractWaMessageId(userId, msg.id);
    if (!waId) {
      throw new HttpException(
        'Esta mensagem não tem ID do WhatsApp (histórico antigo). Não é possível apagar na Evolution.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName =
      dto.instanceName || msg.instanceName || (await this.instanceResolver.getDefaultInstanceName(userId));
    await this.instanceResolver.assertInstanceExists(instanceName);

    const remoteJid = buildRemoteJid(contactNumber);
    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
    const evolutionHeaders = { apikey: evoApiKey, 'Content-Type': 'application/json' };

    try {
      await axios.delete(`${evoBaseUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
        headers: evolutionHeaders,
        data: {
          id: waId,
          remoteJid,
          fromMe: true,
          participant: '',
        },
      });
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        e?.message;
      this.logger.warn(`Evolution deleteMessageForEveryone: ${detail}`);
      throw new HttpException(detail || 'Erro ao apagar mensagem na Evolution.', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.message.delete({ where: { id: msg.id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.WHATSAPP_MESSAGE,
        resourceId: String(msg.id),
        rawReason: dto.reason,
        snapshot: msg,
      });
    });
    await this.contactsService.refreshContactLastMessage(userId, contactNumber);
    return { success: true };
  }

  async updateMessageText(
    userId: string,
    dto: { contactNumber: string; messageId: string; text: string; instanceName?: string },
  ) {
    const text = String(dto.text ?? '').trim();
    if (!text) throw new HttpException('Texto inválido.', HttpStatus.BAD_REQUEST);

    const contactNumber = normalizeStoredContactKey(String(dto.contactNumber || '').trim());
    const msg = await this.findUserMessageForAction(userId, contactNumber, dto.messageId);
    if (!msg) throw new HttpException('Mensagem não encontrada.', HttpStatus.NOT_FOUND);
    if (msg.type !== 'sent') {
      throw new HttpException('Só pode editar mensagens enviadas por si.', HttpStatus.BAD_REQUEST);
    }
    if (msg.isMedia) {
      throw new HttpException('Não é possível editar mensagens de mídia.', HttpStatus.BAD_REQUEST);
    }

    const ageEditMs = Date.now() - msg.timestamp.getTime();
    if (ageEditMs < 0 || ageEditMs > WA_EDIT_MAX_MS) {
      throw new HttpException(
        'Só é possível editar mensagens até 14 minutos após o envio.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const waId = extractWaMessageId(userId, msg.id);
    if (!waId) {
      throw new HttpException(
        'Esta mensagem não tem ID do WhatsApp (histórico antigo). Não é possível editar na Evolution.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName =
      dto.instanceName || msg.instanceName || (await this.instanceResolver.getDefaultInstanceName(userId));
    await this.instanceResolver.assertInstanceExists(instanceName);

    const remoteJid = buildRemoteJid(contactNumber);
    const evoNumber = evolutionSendNumber(contactNumber);
    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
    const evolutionHeaders = { apikey: evoApiKey, 'Content-Type': 'application/json' };

    try {
      await axios.post(
        `${evoBaseUrl}/chat/updateMessage/${encodeURIComponent(instanceName)}`,
        {
          number: evoNumber,
          text,
          key: {
            remoteJid,
            fromMe: true,
            id: waId,
          },
        },
        { headers: evolutionHeaders },
      );
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        e?.message;
      this.logger.warn(`Evolution updateMessage: ${detail}`);
      throw new HttpException(detail || 'Erro ao editar mensagem na Evolution.', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.message.update({
      where: { id: msg.id },
      data: { text },
    });
    await this.contactsService.refreshContactLastMessage(userId, contactNumber);
    return { success: true };
  }
}
