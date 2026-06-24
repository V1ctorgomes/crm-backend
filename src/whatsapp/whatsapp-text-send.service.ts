import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBoundedText,
  WHATSAPP_MESSAGE_TEXT_MAX,
} from '../common/text-bounds';
import { WhatsappSendQueueService } from './whatsapp-send-queue.service';
import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';
import { evolutionErrorDetail } from './whatsapp-evolution-error.util';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { WhatsappRecipientCheckService } from './whatsapp-recipient-check.service';
import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';
import {
  buildScopedMessageId,
  evolutionSendNumber,
  isGroupRemoteJid,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappTextSendService {
  private readonly logger = new Logger(WhatsappTextSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendQueue: WhatsappSendQueueService,
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly recipientCheck: WhatsappRecipientCheckService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
  ) {}

  async sendText(userId: string, number: string, text: string, requestedInstanceName?: string) {
    const safeText = assertBoundedText(text, 'Mensagem', WHATSAPP_MESSAGE_TEXT_MAX, { min: 1 });
    const instanceName = requestedInstanceName || (await this.instanceResolver.getDefaultInstanceName(userId));
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    if (!ownedInstance) throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    const contactKey = normalizeStoredContactKey(String(number ?? '').trim());
    const evoNumber = evolutionSendNumber(contactKey);
    if (!evoNumber) {
      throw new HttpException('Número ou grupo inválido para envio.', HttpStatus.BAD_REQUEST);
    }
    await this.recipientCheck.assertBeforeFirstOutbound(userId, contactKey, instanceName, evoNumber);
    try {
      const { baseUrl, apiKey } = await this.creds.get();
      const response = await this.sendQueue.runForInstance(instanceName, () =>
        axios.post(
          `${baseUrl}/message/sendText/${instanceName}`,
          { number: evoNumber, text: safeText },
          { headers: { apikey: apiKey } },
        ),
      );
      this.instanceHealth.recordSendSuccess(instanceName);
      const waId = response.data?.key?.id;

      let createDisplayName: string | undefined;
      if (isGroupRemoteJid(contactKey)) {
        createDisplayName =
          (await this.groupSubjectService.tryFetchGroupSubject(instanceName, contactKey, { retries: 1 })) ||
          'Grupo WhatsApp';
      }

      await this.prisma.contact.upsert({
        where: { number_userId: { number: contactKey, userId } },
        update: { lastMessage: safeText, lastMessageTime: new Date(), instanceName },
        create: {
          number: contactKey,
          userId,
          name: createDisplayName ?? contactKey,
          lastMessage: safeText,
          instanceName,
        },
      });

      if (waId) {
        try {
          await this.prisma.message.create({
            data: {
              id: buildScopedMessageId(userId, String(waId)),
              userId,
              instanceName,
              contactNumber: contactKey,
              text: safeText,
              type: 'sent',
              timestamp: new Date(),
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }
      return {
        success: true,
        data: response.data,
        messageId: waId ? buildScopedMessageId(userId, String(waId)) : undefined,
      };
    } catch (e: unknown) {
      this.instanceHealth.recordSendFailure(instanceName);
      const detail = evolutionErrorDetail(e);
      this.logger.error(`Evolution sendText falhou (${instanceName}): ${detail}`);
      if (e instanceof HttpException) throw e;
      const status =
        e && typeof e === 'object' && 'response' in e && (e as { response?: { status?: number } }).response?.status === 429
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.BAD_REQUEST;
      throw new HttpException(detail || 'Erro ao enviar pela Evolution.', status);
    }
  }
}
