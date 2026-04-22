// @ts-nocheck
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = String(process.env.EVOLUTION_API_KEY || '');

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  private async getDefaultInstanceName(): Promise<string> {
    const inst = await this.prisma.instance.findFirst({ where: { status: 'connected' } });
    if (!inst) throw new HttpException('Sem instância conectada.', HttpStatus.BAD_REQUEST);
    return inst.name;
  }

  private async fetchProfilePicture(number: string, instanceName: string): Promise<string | undefined> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
        { number },
        { headers: { apikey: this.apiKey } }
      );
      return response.data?.profilePictureUrl || undefined;
    } catch {
      return undefined;
    }
  }

  async processWebhook(payload: any) {
    const allowedEvents = ['messages.upsert', 'messages.update', 'send.message'];
    
    if (!payload || !payload.event || !allowedEvents.includes(String(payload.event)) || !payload.data) {
      return;
    }

    const instanceName = String(payload.instance || '');
    const payloadData = payload.data;
    const msgData = Array.isArray(payloadData) ? payloadData[0] : payloadData;
    
    if (!msgData || !msgData.key) return;

    const remoteJid = String(msgData.key.remoteJid || '');
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    const contactNumber = remoteJid.split('@')[0];
    const isFromMe = Boolean(msgData.key.fromMe);
    const waId = msgData.key.id ? String(msgData.key.id) : undefined;
    const pushName = msgData.pushName ? String(msgData.pushName) : contactNumber;

    const msg = msgData.message;
    let text = msg?.conversation || msg?.extendedTextMessage?.text || "";

    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;
    let isMedia = false;

    const mediaObject = msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.audioMessage || msg?.stickerMessage;

    if (mediaObject) {
      isMedia = true;
      mimeType = mediaObject.mimetype ? String(mediaObject.mimetype).split(';')[0] : 'application/octet-stream';
      const ext = mimeType.split('/')[1] || 'bin';
      fileName = mediaObject.fileName ? String(mediaObject.fileName) : `arquivo.${ext}`;
      
      text = mediaObject.caption || text || (msg?.imageMessage ? "📷 Imagem" : msg?.documentMessage ? "📄 Documento" : msg?.audioMessage ? "🎵 Áudio" : "Mídia");

      try {
        const response = await axios.post(
          `${this.apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
          { message: msgData },
          { headers: { 'Content-Type': 'application/json', apikey: this.apiKey } }
        );

        if (response.data && response.data.base64) {
          const buffer = Buffer.from(String(response.data.base64), 'base64');
          mediaUrl = await this.r2Service.uploadBuffer(buffer, fileName, mimeType, contactNumber);
        }
      } catch (error) {
        this.logger.error("Erro ao baixar mídia da Evolution", error);
        text = "⚠️ [Falha ao salvar mídia na nuvem]";
      }
    }

    if (!text && !isMedia) text = "Mensagem não suportada";

    try {
      if (payload.event === 'messages.upsert' || payload.event === 'send.message') {
        const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });
        let picUrl = existingContact?.profilePictureUrl || undefined;
        
        if (!picUrl) {
          picUrl = await this.fetchProfilePicture(contactNumber, instanceName);
        }

        await this.prisma.contact.upsert({
          where: { number: contactNumber },
          update: { 
            lastMessage: text, 
            lastMessageTime: new Date(), 
            instanceName, 
            ...(picUrl && { profilePictureUrl: picUrl }) 
          },
          create: { 
            number: contactNumber, 
            name: pushName, 
            lastMessage: text, 
            instanceName, 
            profilePictureUrl: picUrl || null 
          }
        });

        if (waId) {
          const msgExists = await this.prisma.message.findUnique({ where: { id: waId } });
          if (!msgExists) {
            await this.prisma.message.create({
              data: { 
                id: waId, 
                instanceName, 
                contactNumber, 
                text, 
                type: isFromMe ? 'sent' : 'received', 
                timestamp: new Date(),
                isMedia,           
                mediaData: mediaUrl || null, 
                mimeType: mimeType || null,          
                fileName: fileName || null           
              }
            });
          }
        }
        
        if (picUrl) {
          msgData.profilePictureUrl = picUrl;
        }

        if (isMedia) {
          msgData.customMedia = { isMedia, mediaData: mediaUrl, mimeType, fileName, text };
        }
      }

      this.messageSubject.next(payload);
    } catch (e) {
      this.logger.error("Erro no processamento do Webhook", e);
    }
  }

  async sendText(number: string, text: string) {
    const instanceName = await this.getDefaultInstanceName();
    try {
      const response = await axios.post(
        `${this.apiUrl}/message/sendText/${instanceName}`, 
        { number, text }, 
        { headers: { apikey: this.apiKey } }
      );
      const waId = response.data?.key?.id;
      
      await this.prisma.contact.upsert({
        where: { number: number },
        update: { lastMessage: text, lastMessageTime: new Date(), instanceName },
        create: { number: number, name: number, lastMessage: text, instanceName }
      });

      if (waId) {
        await this.prisma.message.create({ 
          data: { id: String(waId), instanceName, contactNumber: number, text, type: 'sent', timestamp: new Date() } 
        });
      }
      return { success: true, data: response.data };
    } catch (e) { 
      throw new HttpException('Erro ao enviar', HttpStatus.BAD_REQUEST); 
    }
  }

  async sendMedia(number: string, file: any, caption: string) {
    const instanceName = await this.getDefaultInstanceName();
    const cleanNumber = String(number).replace(/\D/g, '');

    const fileBuffer = file.buffer;
    const fileOriginalName = String(file.originalname || 'arquivo.bin');
    const fileMimeType = String(file.mimetype || 'application/octet-stream');

    if (!fileBuffer) {
       throw new HttpException('Arquivo inválido ou ausente.', HttpStatus.BAD_REQUEST);
    }

    let mediaUrl = '';
    try {
      mediaUrl = await this.r2Service.uploadBuffer(fileBuffer, fileOriginalName, fileMimeType, cleanNumber);
    } catch (error) {
      this.logger.error('Erro ao fazer upload para R2', error);
      throw new HttpException('Falha ao salvar arquivo na nuvem', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let mediatype = 'document';
    if (fileMimeType.startsWith('image')) mediatype = 'image';
    else if (fileMimeType.startsWith('video')) mediatype = 'video';
    else if (fileMimeType.startsWith('audio')) mediatype = 'audio';

    try {
      const response = await axios.post(
        `${this.apiUrl}/message/sendMedia/${instanceName}`,
        { 
          number: cleanNumber, 
          mediatype, 
          mimetype: fileMimeType, 
          caption, 
          media: mediaUrl, 
          fileName: fileOriginalName 
        },
        { headers: { apikey: this.apiKey } }
      );

      const waId = response.data?.key?.id || Date.now().toString();

      await this.prisma.contact.upsert({
        where: { number: cleanNumber },
        update: { lastMessage: caption || '📷 Mídia', lastMessageTime: new Date(), instanceName },
        create: { number: cleanNumber, name: cleanNumber, lastMessage: caption || '📷 Mídia', instanceName }
      });

      const savedMessage = await this.prisma.message.create({
        data: {
          id: String(waId), 
          instanceName, 
          contactNumber: cleanNumber, 
          text: caption || '📷 Mídia', 
          type: 'sent',
          isMedia: true, 
          mediaData: mediaUrl, 
          mimeType: fileMimeType, 
          fileName: fileOriginalName, 
          timestamp: new Date()
        }
      });

      return { success: true, id: waId, mediaData: mediaUrl, ...savedMessage };
    } catch (error: any) {
      this.logger.error("Erro API ao enviar mídia", error?.response?.data || error.message);
      throw new HttpException('Falha ao enviar arquivo', HttpStatus.BAD_REQUEST);
    }
  }

  async getContacts() {
    try {
      const instanceName = await this.getDefaultInstanceName();
      return await this.prisma.contact.findMany({ 
        where: { instanceName }, // RETORNA TODOS OS CONTATOS DA INSTÂNCIA (Ativos e Inativos)
        orderBy: { lastMessageTime: 'desc' } 
      });
    } catch { return []; }
  }

  async getChatHistory(number: string) {
    try {
      const instanceName = await this.getDefaultInstanceName();
      return await this.prisma.message.findMany({ where: { contactNumber: number, instanceName }, orderBy: { timestamp: 'asc' } });
    } catch { return []; }
  }

  async deleteConversation(number: string) {
    try {
      const instanceName = await this.getDefaultInstanceName();
      
      // 0. NOVO: Apaga as mídias da Cloudflare R2 antes de limpar o banco!
      await this.r2Service.deleteFolder(number);

      // 1. Apaga fisicamente as mensagens todas
      await this.prisma.message.deleteMany({ where: { contactNumber: number, instanceName } });
      
      // 2. Não apaga o contacto! Apenas limpa a última mensagem para o ocultar da barra lateral
      try {
        await this.prisma.contact.update({ 
          where: { number }, 
          data: { lastMessage: '', lastMessageTime: null } 
        });
      } catch (updateErr) {
      }
      
      return { success: true };
    } catch (e) {
      this.logger.error('Erro ao excluir conversa', e);
      throw new HttpException('Erro ao excluir', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}