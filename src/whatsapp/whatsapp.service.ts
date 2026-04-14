import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service'; // Confirme se o caminho está certo para o seu projeto

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(private prisma: PrismaService) {}

  // ==========================================
  // NOVA FUNÇÃO: FORÇAR A BUSCA DA FOTO
  // ==========================================
  private async fetchProfilePicture(number: string): Promise<string | undefined> {
    try {
      const endpoint = `${this.apiUrl}/chat/fetchProfilePictureUrl/${this.instanceName}`;
      const response = await axios.post(
        endpoint,
        { number: number },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );
      // Retorna o link da foto do WhatsApp
      return response.data?.profilePictureUrl || undefined;
    } catch (error) {
      // Se a pessoa não tiver foto ou ocultar nas configurações de privacidade do WhatsApp
      return undefined;
    }
  }

  // ==========================================
  // RECEBER E SALVAR NO BANCO DE DADOS
  // ==========================================
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
      // Verifica se o contato já existe no nosso banco de dados
      const existingContact = await this.prisma.contact.findUnique({ where: { number: contactNumber } });

      // 🚨 A MAGIA ACONTECE AQUI: Se a Evolution não enviou a foto E nós ainda não a temos no Banco...
      if (!picUrl && (!existingContact || !existingContact.profilePictureUrl)) {
        picUrl = await this.fetchProfilePicture(contactNumber);
      }

      // 1. Atualiza o Contato e a Foto
      const contact = await this.prisma.contact.upsert({
        where: { number: contactNumber },
        update: { 
          name: pushName, 
          // Só atualiza a foto se a API encontrou uma
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

      // 2. Salva a Mensagem no Histórico
      await this.prisma.message.create({
        data: {
          contactNumber: contact.number,
          text: incomingText,
          type: isFromMe ? 'sent' : 'received',
          timestamp: new Date()
        }
      });

      // 3. Avisa a tela (Frontend) que chegou mensagem
      // Injetamos a foto recém-descoberta no payload para a tela do CRM mostrar imediatamente
      if (picUrl) {
         payload.data.profilePictureUrl = picUrl; 
      }
      this.messageSubject.next({ data: payload });
      
    } catch (e) {
      this.logger.error('Erro ao salvar no banco:', e);
    }
  }

  // ==========================================
  // ENVIAR E SALVAR NO BANCO DE DADOS
  // ==========================================
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

  // ==========================================
  // MÉTODOS DE BUSCA (API)
  // ==========================================
  async getContacts() {
    return this.prisma.contact.findMany({
      orderBy: { lastMessageTime: 'desc' },
    });
  }

  async getChatHistory(number: string) {
    return this.prisma.message.findMany({
      where: { contactNumber: number },
      orderBy: { timestamp: 'asc' },
    });
  }
}