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
    const inst = await this.prisma.instance.findFirst({ where: { status: 'connected' } });
    if (!inst) throw new HttpException('Sem instância conectada.', HttpStatus.BAD_REQUEST);
    return inst.name;
  }

  // CORREÇÃO: Função para buscar a foto de perfil na Evolution API
  private async fetchProfilePicture(number: string, instanceName: string): Promise<string | undefined> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/chat/fetchProfilePictureUrl/${instanceName}`, 
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
    const instanceName = payload.instance;
    const msgData = payload.data;
    const remoteJid = msgData.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us')) return;

    const contactNumber = remoteJid.split('@')[0];
    const isFromMe = msgData.key?.fromMe || false;
    const text = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || "Mídia";
    const pushName = msgData.pushName || contactNumber;

    try {
      // 1. Verifica se já temos este contacto e se ele já tem foto
      const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });
      let picUrl = existingContact?.profilePictureUrl;
      
      // 2. Se não tem foto, pede à Evolution
      if (!picUrl) {
        picUrl = await this.fetchProfilePicture(contactNumber, instanceName);
      }

      // 3. Atualiza ou cria o contacto, guardando a foto
      const contact = await this.prisma.contact.upsert({
        where: { number: contactNumber },
        update: { 
          name: pushName !== contactNumber ? pushName : existingContact?.name, 
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

      await this.prisma.message.create({
        data: { instanceName, contactNumber, text, type: isFromMe ? 'sent' : 'received', timestamp: new Date() }
      });

      // Anexa a foto ao evento de "tempo real" (SSE) para aparecer logo no frontend
      if (picUrl) payload.data.profilePictureUrl = picUrl;
      this.messageSubject.next(payload);
    } catch (e) { 
      this.logger.error("Erro Webhook DB", e); 
    }
  }

  async sendText(number: string, text: string) {
    const instanceName = await this.getDefaultInstanceName();
    try {
      await axios.post(`${this.apiUrl}/message/sendText/${instanceName}`, { number, text }, { headers: { apikey: this.apiKey } });
      await this.prisma.message.create({ data: { instanceName, contactNumber: number, text, type: 'sent' } });
      return { success: true };
    } catch (e) { throw new HttpException('Erro ao enviar', HttpStatus.BAD_REQUEST); }
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
      return this.prisma.message.findMany({ where: { contactNumber: number, instanceName }, orderBy: { timestamp: 'asc' } });
    } catch { return []; }
  }

  async deleteConversation(number: string) {
    const instanceName = await this.getDefaultInstanceName();
    await this.prisma.message.deleteMany({ where: { contactNumber: number, instanceName } });
    await this.prisma.contact.update({ where: { number }, data: { lastMessage: '', lastMessageTime: null } });
    return { success: true };
  }
}