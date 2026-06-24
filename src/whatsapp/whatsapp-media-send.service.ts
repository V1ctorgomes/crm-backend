import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import {
  assertOptionalBoundedText,
  WHATSAPP_CAPTION_MAX,
} from '../common/text-bounds';
import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';
import { evolutionErrorDetail } from './whatsapp-evolution-error.util';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { WhatsappRecipientCheckService } from './whatsapp-recipient-check.service';
import {
  evolutionSendNumber,
  normalizeStoredContactKey,
} from './whatsapp-contact-jid.util';
import { prepareOutboundMediaFile } from './whatsapp-media-prep.util';
import { WhatsappEvolutionMediaSendService } from './whatsapp-evolution-media-send.service';
import { WhatsappMediaPersistService } from './whatsapp-media-persist.service';

@Injectable()
export class WhatsappMediaSendService {
  private readonly logger = new Logger(WhatsappMediaSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly recipientCheck: WhatsappRecipientCheckService,
    private readonly evolutionMediaSend: WhatsappEvolutionMediaSendService,
    private readonly mediaPersist: WhatsappMediaPersistService,
  ) {}

  async sendMedia(userId: string, number: string, file: any, caption: string, requestedInstanceName?: string) {
    const safeCaption =
      assertOptionalBoundedText(caption, 'Legenda', WHATSAPP_CAPTION_MAX) ?? '';
    const instanceName = requestedInstanceName || (await this.instanceResolver.getDefaultInstanceName(userId));
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    if (!ownedInstance) throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    const contactKey = normalizeStoredContactKey(String(number ?? '').trim());
    const evoNumber = evolutionSendNumber(contactKey);
    if (!evoNumber) {
      throw new HttpException(
        'Número do contato em falta ou inválido no pedido. Recarregue a conversa e tente novamente.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.recipientCheck.assertBeforeFirstOutbound(userId, contactKey, instanceName, evoNumber);

    let prepared;
    try {
      prepared = await prepareOutboundMediaFile(file);
    } catch {
      throw new HttpException('Arquivo inválido, vazio ou não recebido pelo servidor.', HttpStatus.BAD_REQUEST);
    }

    const stableObjectId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let mediaUrl = '';
    try {
      const mediaFolder = this.r2Service.conversasPath(userId, contactKey);
      mediaUrl = await this.r2Service.uploadBuffer(
        prepared.buffer,
        prepared.originalName,
        prepared.mimeType,
        mediaFolder,
        stableObjectId,
      );
    } catch (error) {
      this.logger.error('Erro ao fazer upload para R2', error);
      throw new HttpException('Falha ao salvar arquivo na nuvem', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      const response = await this.evolutionMediaSend.send(
        instanceName,
        evoNumber,
        mediaUrl,
        prepared.mimeType,
        prepared.originalName,
        safeCaption,
        prepared.mediatype,
      );

      this.instanceHealth.recordSendSuccess(instanceName);

      const waId = response.data?.key?.id || Date.now().toString();
      const messageId = await this.mediaPersist.persistSentMedia({
        userId,
        instanceName,
        contactKey,
        waId: String(waId),
        safeCaption,
        fallbackText: prepared.fallbackText,
        mediaUrl,
        fileMimeType: prepared.mimeType,
        fileOriginalName: prepared.originalName,
      });

      return {
        success: true,
        id: String(waId),
        messageId,
        mediaData: mediaUrl,
        mimeType: prepared.mimeType,
        fileName: prepared.originalName,
        isMedia: true,
      };
    } catch (error: unknown) {
      this.instanceHealth.recordSendFailure(instanceName);
      if (error instanceof HttpException) throw error;
      const detail = evolutionErrorDetail(error);
      this.logger.error(`Evolution sendMedia falhou (${instanceName}): ${detail}`);
      let userMessage = detail || 'Falha ao enviar arquivo pela Evolution.';
      const hint =
        ' Confirme que R2_PUBLIC_URL é HTTPS e público (o servidor Evolution precisa de conseguir descarregar o ficheiro).';
      const lower = String(userMessage).toLowerCase();
      if (
        lower.includes('fetch') ||
        lower.includes('download') ||
        lower.includes('timeout') ||
        lower.includes('econnrefused') ||
        lower.includes('getaddrinfo')
      ) {
        userMessage += hint;
      }
      throw new HttpException(userMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
