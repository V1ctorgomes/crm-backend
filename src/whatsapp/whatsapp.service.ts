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

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  private async getDefaultInstanceName(): Promise<string> {
    const instance = await this.prisma.instance.findFirst();
    if (!instance) throw new HttpException('Nenhuma instância configurada.', HttpStatus.BAD_REQUEST);
    return instance.name;
  }

  private async fetchProfilePicture(number: string, instanceName: string): Promise<string | undefined> {
    try {
      const response = await axios.post(`${this.apiUrl}/chat/fetchProfilePictureUrl/${instanceName}`, { number: number }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } });
      return response.data?.profilePictureUrl || undefined;
    } catch (error) { return undefined; }
  }

  async processWebhook(payload: any) {
    if (payload?.event !== 'messages.upsert' || !payload?.data) return;

    const instanceName = payload.instance || (await this.prisma.instance.findFirst())?.name;
    if (!instanceName) return;

    const msgData = payload.data;
    const remoteJid = msgData.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    const contactNumber = remoteJid.split('@')[0];
    const isFromMe = msgData.key?.fromMe || false;
    const pushName = msgData.pushName || contactNumber;
    let picUrl: string | undefined = msgData.profilePictureUrl || undefined;

    const msg = msgData.message;
    let incomingText: string = msg?.conversation || msg?.extendedTextMessage?.text || "";

    let mediaUrl, mimeType, fileName;
    const mediaObject = msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.audioMessage || msg?.stickerMessage;

    if (mediaObject && !isFromMe) { 
      try {
        const response = await axios.post(`${this.apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, { message: msgData }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } });
        if (response.data?.base64) {
          mimeType = mediaObject.mimetype?.split(';')[0] || 'application/octet-stream';
          fileName = mediaObject.fileName || `arquivo.${mimeType.split('/')[1] || 'bin'}`;
          mediaUrl = await this.r2Service.uploadBuffer(Buffer.from(response.data.base64, 'base64'), fileName, mimeType, contactNumber);
          incomingText = mediaObject.caption || ""; 
        }
      } catch (error) { incomingText = "⚠️ [Arquivo não pôde ser carregado]"; }
    } else if (!incomingText && mediaObject) incomingText = mediaObject.caption || "";

    try {
      const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });
      if (!picUrl && (!existingContact || !existingContact.profilePictureUrl)) picUrl = await this.fetchProfilePicture(contactNumber, instanceName);

      const contact = await this.prisma.contact.upsert({
        where: { number: contactNumber },
        update: { name: pushName, ...(picUrl && { profilePictureUrl: picUrl }), lastMessage: incomingText || 'Mídia', lastMessageTime: new Date(), instanceName },
        create: { number: contactNumber, name: pushName, profilePictureUrl: picUrl, lastMessage: incomingText || 'Mídia', instanceName },
      });

      await this.prisma.message.create({
        data: { instanceName, contactNumber: contact.number, text: incomingText, type: isFromMe ? 'sent' : 'received', isMedia: !!mediaUrl, mediaData: mediaUrl, mimeType, fileName, timestamp: new Date() }
      });

      if (picUrl) payload.data.profilePictureUrl = picUrl;
      payload.data.customMedia = { isMedia: !!mediaUrl, mediaData: mediaUrl, mimeType, fileName, text: incomingText };

      this.messageSubject.next({ data: payload });
    } catch (e) { this.logger.error('Erro DB:', e); }
  }

  async sendText(number: string, text: string) {
    const instanceName = await this.getDefaultInstanceName();
    const cleanNumber = number.replace(/\D/g, '');
    
    try {
      const response = await axios.post(`${this.apiUrl}/message/sendText/${instanceName}`, { number: cleanNumber, text: text }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } });
      await this.prisma.message.create({ data: { instanceName, contactNumber: cleanNumber, text: text, type: 'sent', timestamp: new Date() } });
      await this.prisma.contact.upsert({
        where: { number: cleanNumber },
        update: { lastMessage: text, lastMessageTime: new Date(), instanceName },
        create: { number: cleanNumber, name: cleanNumber, lastMessage: text, instanceName }
      });
      return { success: true, messageId: response.data?.key?.id };
    } catch (error) { throw new HttpException('Falha na API Evolution', HttpStatus.BAD_REQUEST); }
  }

  async sendMedia(number: string, publicUrl: string, fileName: string, mimeType: string, caption: string) {
    const instanceName = await this.getDefaultInstanceName();
    const cleanNumber = number.replace(/\D/g, '');
    let mediatype = mimeType.startsWith('image') ? 'image' : mimeType.startsWith('video') ? 'video' : mimeType.startsWith('audio') ? 'audio' : 'document';

    try {
      const response = await axios.post(`${this.apiUrl}/message/sendMedia/${instanceName}`, { number: cleanNumber, mediatype, mimetype: mimeType, caption, media: publicUrl, fileName }, { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } });
      const savedMessage = await this.prisma.message.create({ data: { instanceName, contactNumber: cleanNumber, text: caption, type: 'sent', isMedia: true, mediaData: publicUrl, mimeType, fileName, timestamp: new Date() } });
      return { success: true, messageId: response.data?.key?.id, ...savedMessage };
    } catch (error) { throw new HttpException('Falha ao enviar mídia', HttpStatus.BAD_REQUEST); }
  }

  async getContacts() {
    try {
      const instanceName = await this.getDefaultInstanceName();
      return this.prisma.contact.findMany({ where: { instanceName }, orderBy: { lastMessageTime: 'desc' } });
    } catch { return []; }
  }

  async getChatHistory(number: string) {
    try {
      const instanceName = await this.getDefaultInstanceName();
      return this.prisma.message.findMany({
        where: { contactNumber: number, instanceName }, orderBy: { timestamp: 'asc' },
        select: { id: true, text: true, type: true, timestamp: true, isMedia: true, mediaData: true, mimeType: true, fileName: true, contactNumber: true }
      });
    } catch { return []; }
  }

  async deleteConversation(number: string) {
    try {
      const instanceName = await this.getDefaultInstanceName();
      await this.prisma.message.deleteMany({ where: { contactNumber: number, instanceName } });
      await this.prisma.contact.update({ where: { number }, data: { lastMessage: '', lastMessageTime: null } }).catch(() => null);
      return { success: true };
    } catch { return { success: false }; }
  }
}