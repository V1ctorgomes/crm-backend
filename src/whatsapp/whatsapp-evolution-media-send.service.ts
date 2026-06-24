import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WhatsappSendQueueService } from './whatsapp-send-queue.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';

@Injectable()
export class WhatsappEvolutionMediaSendService {
  private readonly logger = new Logger(WhatsappEvolutionMediaSendService.name);

  constructor(
    private readonly sendQueue: WhatsappSendQueueService,
    private readonly creds: WhatsappEvolutionCredentialsService,
  ) {}

  async send(
    instanceName: string,
    evoNumber: string,
    mediaUrl: string,
    fileMimeType: string,
    fileOriginalName: string,
    safeCaption: string,
    mediatype: 'document' | 'image' | 'video' | 'audio',
  ) {
    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
    const evolutionHeaders = { apikey: evoApiKey };

    return this.sendQueue.runForInstance(instanceName, async () => {
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
  }
}
