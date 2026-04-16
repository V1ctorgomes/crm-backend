import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  private async fetchProfilePicture(number: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.apiUrl}/chat/fetchProfilePictureUrl/${this.instanceName}`;
      const response = await axios.post(
        endpoint, { number: number }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );
      return response.data?.profilePictureUrl || undefined;
    } catch (error) { return undefined; }
  }

  async processWebhook(payload: any) {
    if (payload?.event !== 'messages.upsert' || !payload?.data) return;

    const msgData = payload.data;
    const remoteJid = msgData.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    const contactNumber = remoteJid.split('@')[0];
    const isFromMe = msgData.key?.fromMe || false;
    const pushName = msgData.pushName || contactNumber;
    let picUrl: string | undefined = msgData.profilePictureUrl || undefined;

    const msg = msgData.message;
    let incomingText: string = msg?.conversation || msg?.extendedTextMessage?.text || "";

    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    const mediaObject = msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.audioMessage || msg?.stickerMessage;

    if (mediaObject && !isFromMe) { 
      try {
        const endpoint = `${this.apiUrl}/chat/getBase64FromMediaMessage/${this.instanceName}`;
        const response = await axios.post(
          endpoint, { message: msgData }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
        );

        const base64Data = response.data?.base64;

        if (base64Data) {
          const finalMimeType: string = mediaObject.mimetype?.split(';')[0] || 'application/octet-stream';
          const fileExt: string = finalMimeType.split('/')[1] || 'bin';
          
          let finalFileName: string = mediaObject.fileName || `arquivo_recebido.${fileExt}`;
          if (msg?.audioMessage) {
            finalFileName = 'audio_recebido.ogg';
          }

          const buffer = Buffer.from(base64Data, 'base64');
          mediaUrl = await this.r2Service.uploadBuffer(buffer, finalFileName, finalMimeType, contactNumber);

          mimeType = finalMimeType;
          fileName = finalFileName;
          incomingText = mediaObject.caption || ""; 
        }
      } catch (error: any) {
        this.logger.error('Erro ao baixar mídia da Evolution API:', error?.response?.data || error.message);
        incomingText = "⚠️ [Arquivo recebido, mas não pôde ser carregado]";
      }
    } else if (!incomingText && mediaObject) {
       incomingText = mediaObject.caption || "";
    }

    try {
      const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });
      if (!picUrl && (!existingContact || !existingContact.profilePictureUrl)) {
        picUrl = await this.fetchProfilePicture(contactNumber);
      }

      const contact = await this.prisma.contact.upsert({
        where: { number: contactNumber },
        update: { name: pushName, ...(picUrl && { profilePictureUrl: picUrl }), lastMessage: incomingText || 'Mídia recebida', lastMessageTime: new Date() },
        create: { number: contactNumber, name: pushName, profilePictureUrl: picUrl, lastMessage: incomingText || 'Mídia recebida' },
      });

      await this.prisma.message.create({
        data: {
          contactNumber: contact.number,
          text: incomingText,
          type: isFromMe ? 'sent' : 'received',
          isMedia: !!mediaUrl,
          mediaData: mediaUrl,
          mimeType: mimeType,
          fileName: fileName,
          timestamp: new Date()
        }
      });

      if (picUrl) payload.data.profilePictureUrl = picUrl;
      
      payload.data.customMedia = {
         isMedia: !!mediaUrl,
         mediaData: mediaUrl,
         mimeType: mimeType,
         fileName: fileName,
         text: incomingText
      };

      this.messageSubject.next({ data: payload });
    } catch (e: any) { 
      this.logger.error('Erro ao salvar no banco:', e); 
    }
  }

  async sendText(number: string, text: string) {
    if (!this.apiUrl || !this.apiKey || !this.instanceName) throw new HttpException('Erro de configuração', HttpStatus.INTERNAL_SERVER_ERROR);
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendText/${this.instanceName}`;
    try {
      const response = await axios.post(endpoint, { number: cleanNumber, text: text }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } });
      await this.prisma.message.create({ data: { contactNumber: cleanNumber, text: text, type: 'sent', timestamp: new Date() } });
      await this.prisma.contact.update({ where: { number: cleanNumber }, data: { lastMessage: text, lastMessageTime: new Date() } }).catch(() => null);
      return { success: true, messageId: response.data?.key?.id };
    } catch (error: any) { throw new HttpException('Falha na API', HttpStatus.BAD_REQUEST); }
  }

  async sendMedia(number: string, publicUrl: string, fileName: string, mimeType: string, caption: string) {
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendMedia/${this.instanceName}`;
    let mediatype = 'document';
    if (mimeType.startsWith('image')) mediatype = 'image';
    else if (mimeType.startsWith('video')) mediatype = 'video';
    else if (mimeType.startsWith('audio')) mediatype = 'audio';

    try {
      const response = await axios.post(
        endpoint, { number: cleanNumber, mediatype: mediatype, mimetype: mimeType, caption: caption, media: publicUrl, fileName: fileName },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );
      const savedMessage = await this.prisma.message.create({
        data: { contactNumber: cleanNumber, text: caption, type: 'sent', isMedia: true, mediaData: publicUrl, mimeType: mimeType, fileName: fileName, timestamp: new Date() }
      });
      return { success: true, messageId: response.data?.key?.id, ...savedMessage };
    } catch (error: any) { throw new HttpException('Falha na API ao enviar mídia', HttpStatus.BAD_REQUEST); }
  }

  async getContacts() {
    return this.prisma.contact.findMany({ orderBy: { lastMessageTime: 'desc' } });
  }

  async getChatHistory(number: string) {
    return this.prisma.message.findMany({
      where: { contactNumber: number }, orderBy: { timestamp: 'asc' },
      select: { id: true, text: true, type: true, timestamp: true, isMedia: true, mediaData: true, mimeType: true, fileName: true, contactNumber: true }
    });
  }

  // NOVA FUNÇÃO: Atualiza os dados do contato no banco de dados
  async updateContact(number: string, data: { name?: string; email?: string; cnpj?: string }) {
    try {
      return await this.prisma.contact.update({
        where: { number },
        data: {
          name: data.name,
          email: data.email,
          cnpj: data.cnpj,
        },
      });
    } catch (error: any) {
      this.logger.error(`Erro ao atualizar contato ${number}:`, error);
      throw new HttpException('Falha ao atualizar contato', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}