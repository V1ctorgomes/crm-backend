import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import {
  assertOptionalBoundedText,
  WHATSAPP_CAPTION_MAX,
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
import {
  coerceWebmAttachmentToAudioIfNeeded,
  resolveUploadedMimeType,
} from './whatsapp-upload-mime.util';

@Injectable()
export class WhatsappMediaSendService {
  private readonly logger = new Logger(WhatsappMediaSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly sendQueue: WhatsappSendQueueService,
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly recipientCheck: WhatsappRecipientCheckService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
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

    let fileBuffer: Buffer | undefined = file?.buffer;
    if (!fileBuffer && file?.path) {
      const { readFile } = await import('fs/promises');
      fileBuffer = await readFile(file.path);
    }
    const fileOriginalName = String(file?.originalname || 'arquivo.bin');
    let fileMimeType = resolveUploadedMimeType(fileOriginalName, String(file?.mimetype || 'application/octet-stream'));
    fileMimeType = coerceWebmAttachmentToAudioIfNeeded(fileOriginalName, fileMimeType);

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new HttpException('Arquivo inválido, vazio ou não recebido pelo servidor.', HttpStatus.BAD_REQUEST);
    }

    const stableObjectId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let mediaUrl = '';
    try {
      const mediaFolder = this.r2Service.conversasPath(userId, contactKey);
      mediaUrl = await this.r2Service.uploadBuffer(
        fileBuffer,
        fileOriginalName,
        fileMimeType,
        mediaFolder,
        stableObjectId,
      );
    } catch (error) {
      this.logger.error('Erro ao fazer upload para R2', error);
      throw new HttpException('Falha ao salvar arquivo na nuvem', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let mediatype = 'document';
    let fallbackText = 'Documento';
    if (fileMimeType.startsWith('image')) {
      mediatype = 'image';
      fallbackText = 'Imagem';
    } else if (fileMimeType.startsWith('video')) {
      mediatype = 'video';
      fallbackText = 'Vídeo';
    } else if (fileMimeType.startsWith('audio')) {
      mediatype = 'audio';
      fallbackText = 'Áudio';
    }

    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
    const evolutionHeaders = { apikey: evoApiKey };

    try {
      const response = await this.sendQueue.runForInstance(instanceName, async () => {
        const postSendMedia = async (media: 'document' | 'audio' | 'image' | 'video') =>
          axios.post(
            `${evoBaseUrl}/message/sendMedia/${instanceName}`,
            {
              number: evoNumber,
              mediatype: media,
              mimetype: fileMimeType,
              caption: safeCaption,
              media: mediaUrl,
              fileName: fileOriginalName,
            },
            { headers: evolutionHeaders },
          );

        if (fileMimeType.startsWith('audio/')) {
          try {
            return await axios.post(
              `${evoBaseUrl}/message/sendWhatsAppAudio/${instanceName}`,
              {
                number: evoNumber,
                audio: mediaUrl,
                encoding: true,
              },
              { headers: evolutionHeaders },
            );
          } catch (audioErr: unknown) {
            const status =
              audioErr && typeof audioErr === 'object' && 'response' in audioErr
                ? (audioErr as { response?: { status?: number } }).response?.status
                : undefined;
            this.logger.warn(
              `sendWhatsAppAudio falhou (${status}), a tentar sendMedia como áudio`,
              audioErr,
            );
            try {
              return await postSendMedia('audio');
            } catch (audioMediaErr: unknown) {
              const status2 =
                audioMediaErr && typeof audioMediaErr === 'object' && 'response' in audioMediaErr
                  ? (audioMediaErr as { response?: { status?: number } }).response?.status
                  : undefined;
              this.logger.warn(
                `sendMedia mediatype=audio falhou (${status2}), fallback documento`,
                audioMediaErr,
              );
              return await postSendMedia('document');
            }
          }
        }
        return postSendMedia(mediatype as 'document' | 'image' | 'video');
      });

      this.instanceHealth.recordSendSuccess(instanceName);

      const waId = response.data?.key?.id || Date.now().toString();

      let createDisplayNameMedia: string | undefined;
      if (isGroupRemoteJid(contactKey)) {
        createDisplayNameMedia =
          (await this.groupSubjectService.tryFetchGroupSubject(instanceName, contactKey, { retries: 1 })) ||
          'Grupo WhatsApp';
      }

      await this.prisma.contact.upsert({
        where: { number_userId: { number: contactKey, userId } },
        update: { lastMessage: safeCaption || fallbackText, lastMessageTime: new Date(), instanceName },
        create: {
          number: contactKey,
          userId,
          name: createDisplayNameMedia ?? contactKey,
          lastMessage: safeCaption || fallbackText,
          instanceName,
        },
      });

      const scopedId = buildScopedMessageId(userId, String(waId));
      try {
        await this.prisma.message.create({
          data: {
            id: scopedId,
            userId,
            instanceName,
            contactNumber: contactKey,
            text: safeCaption,
            type: 'sent',
            isMedia: true,
            mediaData: mediaUrl,
            mimeType: fileMimeType,
            fileName: fileOriginalName,
            timestamp: new Date(),
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          this.logger.warn(`create mídia duplicada ignorada: ${scopedId}`);
        } else {
          throw e;
        }
      }

      return {
        success: true,
        id: String(waId),
        messageId: scopedId,
        mediaData: mediaUrl,
        mimeType: fileMimeType,
        fileName: fileOriginalName,
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
