import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service'; 

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(private prisma: PrismaService) {}

  private async fetchProfilePicture(number: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.apiUrl}/chat/fetchProfilePictureUrl/${this.instanceName}`;
      const response = await axios.post(
        endpoint,
        { number: number },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );
      return response.data?.profilePictureUrl || undefined;
    } catch (error) {
      return undefined;
    }
  }

  async processWebhook(payload: any) {
    if (payload?.event !== 'messages.upsert' || !payload?.data) return;

    const msgData = payload.data;
    const remoteJid = msgData.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    const contactNumber = remoteJid.split('@')[0];
    const incomingText = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || "📷 Mídia/Documento";
    const isFromMe = msgData.key?.fromMe || false;
    const pushName = msgData.pushName || contactNumber;
    let picUrl = msgData.profilePictureUrl || undefined;

    try {
      const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });

      if (!picUrl && (!existingContact || !existingContact.profilePictureUrl)) {
        picUrl = await this.fetchProfilePicture(contactNumber);
      }

      const contact = await this.prisma.contact.upsert({
        where: { number: contactNumber },
        update: { 
          name: pushName, 
          ...(picUrl && { profilePictureUrl: picUrl }),
          lastMessage: incomingText,
          lastMessageTime: new Date()
        },
        create: { 
          number: contactNumber, 
          name: pushName, 
          profilePictureUrl: picUrl,
          lastMessage: incomingText
        },
      });

      await this.prisma.message.create({
        data: {
          contactNumber: contact.number,
          text: incomingText,
          type: isFromMe ? 'sent' : 'received',
          timestamp: new Date()
        }
      });

      if (picUrl) {
         payload.data.profilePictureUrl = picUrl; 
      }
      this.messageSubject.next({ data: payload });
      
    } catch (e) {
      this.logger.error('Erro ao salvar no banco:', e);
    }
  }

  async sendText(number: string, text: string) {
    if (!this.apiUrl || !this.apiKey || !this.instanceName) {
      throw new HttpException('Erro de configuração', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendText/${this.instanceName}`;

    try {
      const response = await axios.post(
        endpoint,
        { number: cleanNumber, text: text },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );

      await this.prisma.message.create({
        data: {
          contactNumber: cleanNumber,
          text: text,
          type: 'sent',
          timestamp: new Date()
        }
      });

      await this.prisma.contact.update({
        where: { number: cleanNumber },
        data: { lastMessage: text, lastMessageTime: new Date() }
      }).catch(() => null);

      return { success: true, messageId: response.data?.key?.id };
    } catch (error: any) {
      this.logger.error(`❌ FALHA AO ENVIAR:`, error.response?.data || error.message);
      throw new HttpException('Falha na API', HttpStatus.BAD_REQUEST);
    }
  }

  // AQUI FOI ALTERADO: AGORA RECEBE publicUrl EM VEZ DE BASE64
  async sendMedia(number: string, publicUrl: string, fileName: string, mimeType: string, caption: string) {
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendMedia/${this.instanceName}`;
    
    let mediatype = 'document';
    if (mimeType.startsWith('image')) mediatype = 'image';
    else if (mimeType.startsWith('video')) mediatype = 'video';
    else if (mimeType.startsWith('audio')) mediatype = 'audio';

    try {
      const response = await axios.post(
        endpoint,
        {
          number: cleanNumber,
          mediatype: mediatype,
          mimetype: mimeType,
          caption: caption,
          media: publicUrl, // <-- Mandamos a URL leve para a Evolution
          fileName: fileName
        },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );

      const savedMessage = await this.prisma.message.create({
        data: {
          contactNumber: cleanNumber,
          text: caption,
          type: 'sent',
          isMedia: true,
          mediaData: publicUrl, // <-- O banco de dados fica leve, só salva a URL
          mimeType: mimeType,
          fileName: fileName,
          timestamp: new Date()
        }
      });

      // Retornamos os dados salvos para o frontend injetar no chat
      return { success: true, messageId: response.data?.key?.id, ...savedMessage };
    } catch (error: any) {
      this.logger.error(`❌ FALHA AO ENVIAR MÍDIA:`, error.response?.data || error.message);
      throw new HttpException('Falha na API ao enviar mídia', HttpStatus.BAD_REQUEST);
    }
  }

  async getContacts() {
    return this.prisma.contact.findMany({
      orderBy: { lastMessageTime: 'desc' },
    });
  }

  async getChatHistory(number: string) {
    return this.prisma.message.findMany({
      where: { contactNumber: number },
      orderBy: { timestamp: 'asc' },
      select: { 
        id: true, text: true, type: true, timestamp: true, 
        isMedia: true, mediaData: true, mimeType: true, 
        fileName: true, contactNumber: true 
      }
    });
  }
}