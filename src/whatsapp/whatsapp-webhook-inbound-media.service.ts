import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import type { ParsedInboundMessage } from './whatsapp-webhook-message.parser';

@Injectable()
export class WhatsappWebhookInboundMediaService {
  private readonly logger = new Logger(WhatsappWebhookInboundMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly creds: WhatsappEvolutionCredentialsService,
  ) {}

  async resolveMediaUrl(
    parsed: ParsedInboundMessage,
    msgData: any,
    instanceName: string,
    primaryUserId: string,
  ): Promise<{ mediaUrl?: string; text: string }> {
    let mediaUrl: string | undefined;
    let text = parsed.text;

    if (!parsed.isMedia || !parsed.extracted.mediaObject) {
      return { mediaUrl, text };
    }

    const primaryMsgExists = parsed.primaryScopedWaId
      ? await this.prisma.message.findUnique({ where: { id: parsed.primaryScopedWaId } })
      : null;

    if (primaryMsgExists) {
      mediaUrl = primaryMsgExists.mediaData || undefined;
    } else if (!parsed.isSelfEchoEvent) {
      try {
        const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
        const response = await axios.post(
          `${evoBaseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
          { message: msgData },
          { headers: { 'Content-Type': 'application/json', apikey: evoApiKey } },
        );

        if (response.data && response.data.base64) {
          const buffer = Buffer.from(String(response.data.base64), 'base64');
          const stableKey =
            parsed.primaryScopedWaId ||
            (parsed.waId ? `${primaryUserId}_${parsed.contactNumber}_${parsed.waId}` : undefined);
          const mediaFolder = this.r2Service.conversasPath(primaryUserId, parsed.contactNumber);
          mediaUrl = await this.r2Service.uploadBuffer(
            buffer,
            parsed.fileName || 'arquivo.bin',
            parsed.mimeType || 'application/octet-stream',
            mediaFolder,
            stableKey,
          );
        }
      } catch (error) {
        this.logger.error('Erro ao baixar mídia da Evolution', error);
        text = 'Falha ao salvar mídia na nuvem';
      }
    }

    return { mediaUrl, text };
  }
}
