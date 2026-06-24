import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  isTypingDelayEnabled,
  PRESENCE_PULSE_MS,
  type ChatPresenceType,
} from './whatsapp-typing.util';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { evolutionSendNumber, normalizeStoredContactKey } from './whatsapp-contact-jid.util';
import { WhatsappTextSendService } from './whatsapp-text-send.service';
import { WhatsappMediaSendService } from './whatsapp-media-send.service';

@Injectable()
export class WhatsappOutboundMessagingService {
  private readonly logger = new Logger(WhatsappOutboundMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly textSend: WhatsappTextSendService,
    private readonly mediaSend: WhatsappMediaSendService,
  ) {}

  async sendChatPresence(
    userId: string,
    number: string,
    presence: ChatPresenceType,
    requestedInstanceName?: string,
  ): Promise<{ ok: true }> {
    if (!isTypingDelayEnabled()) {
      return { ok: true };
    }
    if (presence !== 'composing' && presence !== 'recording') {
      throw new HttpException('Presença inválida.', HttpStatus.BAD_REQUEST);
    }
    const instanceName = requestedInstanceName || (await this.instanceResolver.getDefaultInstanceName(userId));
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    if (!ownedInstance) {
      throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    }
    const contactKey = normalizeStoredContactKey(String(number ?? '').trim());
    const evoNumber = evolutionSendNumber(contactKey);
    if (!evoNumber) {
      throw new HttpException('Número ou grupo inválido.', HttpStatus.BAD_REQUEST);
    }
    try {
      const { baseUrl, apiKey } = await this.creds.get();
      await axios.post(
        `${baseUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`,
        {
          number: evoNumber,
          delay: PRESENCE_PULSE_MS,
          presence,
        },
        {
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );
    } catch (e) {
      this.logger.warn(
        `sendPresence (${presence}) falhou (${instanceName}): ${(e as Error)?.message ?? e}`,
      );
    }
    return { ok: true };
  }

  sendText(userId: string, number: string, text: string, requestedInstanceName?: string) {
    return this.textSend.sendText(userId, number, text, requestedInstanceName);
  }

  sendMedia(userId: string, number: string, file: any, caption: string, requestedInstanceName?: string) {
    return this.mediaSend.sendMedia(userId, number, file, caption, requestedInstanceName);
  }
}
