import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { evolutionErrorDetail } from './whatsapp-evolution-error.util';
import {
  isWhatsAppNumberCheckEnabled,
  parseWhatsAppExistsResult,
} from './whatsapp-number-check.util';
import {
  contactNumberLookupVariants,
  isGroupRemoteJid,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappRecipientCheckService {
  private readonly logger = new Logger(WhatsappRecipientCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creds: WhatsappEvolutionCredentialsService,
  ) {}

  async assertBeforeFirstOutbound(
    userId: string,
    contactKey: string,
    instanceName: string,
    phoneDigits: string,
  ): Promise<void> {
    if (!isWhatsAppNumberCheckEnabled()) return;
    if (isGroupRemoteJid(contactKey)) return;
    const digits = phoneDigits.replace(/\D/g, '');
    if (digits.length < 10) {
      throw new HttpException('Número inválido para envio.', HttpStatus.BAD_REQUEST);
    }

    const variants = contactNumberLookupVariants(contactKey);
    const [priorSent, priorReceived] = await Promise.all([
      this.prisma.message.count({
        where: { userId, contactNumber: { in: variants }, type: 'sent' },
      }),
      this.prisma.message.count({
        where: { userId, contactNumber: { in: variants }, type: 'received' },
      }),
    ]);
    if (priorSent > 0 || priorReceived > 0) return;

    const { baseUrl, apiKey } = await this.creds.get();
    let data: unknown;
    try {
      const res = await axios.post(
        `${baseUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
        { numbers: [digits] },
        {
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          timeout: 20_000,
        },
      );
      data = res.data;
    } catch (e) {
      this.logger.warn(
        `whatsappNumbers falhou (${instanceName}, ${digits}): ${evolutionErrorDetail(e)}`,
      );
      throw new HttpException(
        'Não foi possível verificar se o número tem WhatsApp. Tente novamente em instantes.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const exists = parseWhatsAppExistsResult(data, digits);
    if (exists === false) {
      throw new HttpException(
        'Este número não está registado no WhatsApp. Confira DDI + DDD + número.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (exists === null) {
      this.logger.warn(`whatsappNumbers resposta inesperada (${instanceName}): ${JSON.stringify(data)}`);
    }
  }
}
