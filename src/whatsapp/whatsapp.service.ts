// @ts-nocheck
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = String(process.env.EVOLUTION_API_KEY || '');

  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private pushNotifications: PushNotificationsService,
  ) {}

  private async getDefaultInstanceName(userId: string): Promise<string> {
    const inst = await this.prisma.instance.findFirst({ where: { status: 'connected', userId } });
    if (!inst) throw new HttpException('Sem instância conectada.', HttpStatus.BAD_REQUEST);
    return inst.name;
  }

  private buildScopedMessageId(userId: string, waId: string): string {
    return `${userId}:${waId}`;
  }

  private async getUserIdFromInstance(instanceName: string): Promise<string | null> {
    const instance = await this.prisma.instance.findUnique({
      where: { name: instanceName },
      select: { userId: true },
    });
    return instance?.userId || null;
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
    const userId = await this.getUserIdFromInstance(instanceName);
    if (!userId) return;
    const payloadData = payload.data;
    const msgData = Array.isArray(payloadData) ? payloadData[0] : payloadData;
    
    if (!msgData || !msgData.key) return;

    const remoteJid = String(msgData.key.remoteJid || '');
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

    const contactNumber = remoteJid.split('@')[0];
    const isFromMe = Boolean(msgData.key.fromMe);
    const waId = msgData.key.id ? String(msgData.key.id) : undefined;
    const scopedWaId = waId ? this.buildScopedMessageId(userId, waId) : undefined;
    const pushName = msgData.pushName ? String(msgData.pushName) : contactNumber;

    const msgExists = scopedWaId ? await this.prisma.message.findUnique({ where: { id: scopedWaId } }) : null;

    const msg = msgData.message;
    let text = msg?.conversation || msg?.extendedTextMessage?.text || "";

    let mediaUrl: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;
    let isMedia = false;

    const mediaObject = msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.audioMessage || msg?.stickerMessage;
    let fallbackSidebarText = "Mídia";

    if (mediaObject) {
      isMedia = true;
      mimeType = mediaObject.mimetype ? String(mediaObject.mimetype).split(';')[0] : 'application/octet-stream';
      const ext = mimeType.split('/')[1] || 'bin';
      fileName = mediaObject.fileName ? String(mediaObject.fileName) : `arquivo.${ext}`;

      // Se não houver legenda, text fica vazio
      text = mediaObject.caption || text || "";
      fallbackSidebarText = msg?.imageMessage ? "Imagem" : msg?.documentMessage ? "Documento" : msg?.audioMessage ? "Áudio" : msg?.videoMessage ? "Vídeo" : "Mídia";

      // `send.message` é o eco de envios feitos por nós em `sendMedia`/`sendText`.
      // O ficheiro já está no R2 e a linha em `messages` é (ou está prestes a ser) criada pelo serviço de envio.
      // Baixar/subir aqui causa um segundo objeto duplicado no balde e uma linha extra de mensagem.
      // → Para `send.message`, nunca descarregar a mídia; só reusar o que `msgExists` tiver.
      const isSelfEcho = payload.event === 'send.message';

      if (msgExists) {
        mediaUrl = msgExists.mediaData || undefined;
      } else if (!isSelfEcho) {
        try {
          const response = await axios.post(
            `${this.apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
            { message: msgData },
            { headers: { 'Content-Type': 'application/json', apikey: this.apiKey } }
          );

          if (response.data && response.data.base64) {
            const buffer = Buffer.from(String(response.data.base64), 'base64');
            const stableKey = scopedWaId || (waId ? `${userId}_${contactNumber}_${waId}` : undefined);
            const mediaFolder = this.r2Service.conversasPath(userId, contactNumber);
            mediaUrl = await this.r2Service.uploadBuffer(buffer, fileName, mimeType, mediaFolder, stableKey);
          }
        } catch (error) {
          this.logger.error("Erro ao baixar mídia da Evolution", error);
          text = "Falha ao salvar mídia na nuvem";
        }
      }
    }

    if (!text && !isMedia) text = "Mensagem não suportada";

    let notifyInboundPush = false;
    let inboundPushPreview = '';

    try {
      if (payload.event === 'messages.upsert' || payload.event === 'send.message') {
        const existingContact = await this.prisma.contact.findUnique({
          where: { number_userId: { number: contactNumber, userId } },
        });
        let picUrl = existingContact?.profilePictureUrl || undefined;
        
        if (!picUrl) {
          picUrl = await this.fetchProfilePicture(contactNumber, instanceName);
        }

        const finalSidebarText = text || fallbackSidebarText;

        await this.prisma.contact.upsert({
          where: { number_userId: { number: contactNumber, userId } },
          update: { 
            lastMessage: finalSidebarText, 
            lastMessageTime: new Date(), 
            instanceName, 
            ...(picUrl && { profilePictureUrl: picUrl }) 
          },
          create: { 
            userId,
            number: contactNumber, 
            name: pushName, 
            lastMessage: finalSidebarText, 
            instanceName, 
            profilePictureUrl: picUrl || null 
          }
        });

        // Em `send.message` (eco do nosso próprio envio) a linha é criada por sendMedia/sendText.
        // Tentar criar aqui de novo causaria P2002 ou (pior) sobrescrever com mediaData=null.
        const isSelfEchoEvent = payload.event === 'send.message';
        if (scopedWaId && !msgExists && !isSelfEchoEvent) {
          try {
            await this.prisma.message.create({
              data: {
                id: scopedWaId,
                userId,
                instanceName,
                contactNumber,
                text,
                type: isFromMe ? 'sent' : 'received',
                timestamp: new Date(),
                isMedia,
                mediaData: mediaUrl || null,
                mimeType: mimeType || null,
                fileName: fileName || null,
              },
            });
            if (!isFromMe && payload.event === 'messages.upsert') {
              notifyInboundPush = true;
              inboundPushPreview = String(finalSidebarText).slice(0, 200);
            }
          } catch (e: any) {
            if (e?.code === 'P2002') {
              this.logger.warn(`Mensagem duplicada ignorada (idempotência): ${scopedWaId}`);
            } else {
              throw e;
            }
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

      if (notifyInboundPush) {
        void this.pushNotifications.notifyWhatsappInbound(userId, {
          contactName: pushName,
          contactNumber,
          preview: inboundPushPreview,
        });
      }
    } catch (e) {
      this.logger.error("Erro no processamento do Webhook", e);
    }
  }

  async sendText(userId: string, number: string, text: string, requestedInstanceName?: string) {
    const instanceName = requestedInstanceName || await this.getDefaultInstanceName(userId);
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName, userId } });
    if (!ownedInstance) throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    try {
      const response = await axios.post(
        `${this.apiUrl}/message/sendText/${instanceName}`, 
        { number, text }, 
        { headers: { apikey: this.apiKey } }
      );
      const waId = response.data?.key?.id;
      
      await this.prisma.contact.upsert({
        where: { number_userId: { number, userId } },
        update: { lastMessage: text, lastMessageTime: new Date(), instanceName },
        create: { number, userId, name: number, lastMessage: text, instanceName }
      });

      if (waId) {
        try {
          await this.prisma.message.create({
            data: {
              id: this.buildScopedMessageId(userId, String(waId)),
              userId,
              instanceName,
              contactNumber: number,
              text,
              type: 'sent',
              timestamp: new Date(),
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }
      return { success: true, data: response.data };
    } catch (e) { 
      throw new HttpException('Erro ao enviar', HttpStatus.BAD_REQUEST); 
    }
  }

  async sendMedia(userId: string, number: string, file: any, caption: string, requestedInstanceName?: string) {
    const instanceName = requestedInstanceName || await this.getDefaultInstanceName(userId);
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName, userId } });
    if (!ownedInstance) throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    const cleanNumber = String(number).replace(/\D/g, '');

    const fileBuffer = file.buffer;
    const fileOriginalName = String(file.originalname || 'arquivo.bin');
    const fileMimeType = String(file.mimetype || 'application/octet-stream');

    if (!fileBuffer) {
       throw new HttpException('Arquivo inválido ou ausente.', HttpStatus.BAD_REQUEST);
    }

    // Chave determinística por chamada — qualquer reentrada/repetição sobrescreve o MESMO objeto,
    // em vez de criar duplicados no balde do R2.
    const stableObjectId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let mediaUrl = '';
    try {
      const mediaFolder = this.r2Service.conversasPath(userId, cleanNumber);
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
    if (fileMimeType.startsWith('image')) { mediatype = 'image'; fallbackText = 'Imagem'; }
    else if (fileMimeType.startsWith('video')) { mediatype = 'video'; fallbackText = 'Vídeo'; }
    else if (fileMimeType.startsWith('audio')) { mediatype = 'audio'; fallbackText = 'Áudio'; }

    const evolutionHeaders = { apikey: this.apiKey };

    try {
      let response;

      // Gravações do browser vêm em WebM/Opus; `sendMedia` com mediatype audio falha muitas vezes na Evolution.
      // `sendWhatsAppAudio` + encoding transcodifica para formato aceite pelo WhatsApp (nota de voz).
      if (fileMimeType.startsWith('audio/')) {
        try {
          response = await axios.post(
            `${this.apiUrl}/message/sendWhatsAppAudio/${instanceName}`,
            {
              number: cleanNumber,
              audio: mediaUrl,
              encoding: true,
            },
            { headers: evolutionHeaders },
          );
        } catch (audioErr: any) {
          this.logger.warn(
            `sendWhatsAppAudio falhou (${audioErr?.response?.status}), fallback sendMedia como documento`,
            audioErr?.response?.data || audioErr?.message,
          );
          response = await axios.post(
            `${this.apiUrl}/message/sendMedia/${instanceName}`,
            {
              number: cleanNumber,
              mediatype: 'document',
              mimetype: fileMimeType,
              caption: caption || '',
              media: mediaUrl,
              fileName: fileOriginalName,
            },
            { headers: evolutionHeaders },
          );
        }
      } else {
        response = await axios.post(
          `${this.apiUrl}/message/sendMedia/${instanceName}`,
          {
            number: cleanNumber,
            mediatype,
            mimetype: fileMimeType,
            caption,
            media: mediaUrl,
            fileName: fileOriginalName,
          },
          { headers: evolutionHeaders },
        );
      }

      const waId = response.data?.key?.id || Date.now().toString();

      await this.prisma.contact.upsert({
        where: { number_userId: { number: cleanNumber, userId } },
        update: { lastMessage: caption || fallbackText, lastMessageTime: new Date(), instanceName },
        create: { number: cleanNumber, userId, name: cleanNumber, lastMessage: caption || fallbackText, instanceName }
      });

      const scopedId = this.buildScopedMessageId(userId, String(waId));
      try {
        await this.prisma.message.create({
          data: {
            id: scopedId,
            userId,
            instanceName,
            contactNumber: cleanNumber,
            text: caption || '',
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

      // Devolve o waId "cru" (sem prefixo userId:) para que o frontend possa
      // comparar diretamente com `msgData.key.id` quando o webhook send.message chegar
      // — evitando duplicados visuais na conversa.
      return {
        success: true,
        id: String(waId),
        mediaData: mediaUrl,
        mimeType: fileMimeType,
        fileName: fileOriginalName,
        isMedia: true,
      };
    } catch (error: any) {
      this.logger.error("Erro API ao enviar mídia", error?.response?.data || error.message);
      throw new HttpException('Falha ao enviar arquivo', HttpStatus.BAD_REQUEST);
    }
  }

  async getContacts(userId: string) {
    try {
      return await this.prisma.contact.findMany({ 
        where: { userId },
        orderBy: { lastMessageTime: 'desc' } 
      });
    } catch { return []; }
  }

  async getChatHistory(userId: string, number: string) {
    try {
      return await this.prisma.message.findMany({ 
        where: { userId, contactNumber: number }, 
        orderBy: { timestamp: 'asc' } 
      });
    } catch { return []; }
  }

  async deleteConversation(userId: string, number: string) {
    try {
      const conversasPrefix = this.r2Service.conversasPath(userId, number);
      await this.r2Service.deleteFolder(conversasPrefix);

      await this.prisma.message.deleteMany({ 
        where: { userId, contactNumber: number } 
      });
      
      try {
        await this.prisma.contact.update({ 
          where: { number_userId: { number, userId } }, 
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

  async updateContact(userId: string, number: string, data: any) {
    return await this.prisma.contact.update({
      where: { number_userId: { number, userId } },
      data: {
        name: data.name,
        email: data.email,
        cnpj: data.cnpj,
      },
    });
  }

  async removeContact(userId: string, number: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { number_userId: { number, userId } },
      include: { tickets: true }
    });

    if (!contact) {
      throw new HttpException('Contacto não encontrado.', HttpStatus.NOT_FOUND);
    }

    if (contact.tickets && contact.tickets.length > 0) {
      throw new HttpException(
        'Este contacto possui solicitações (OS) no Kanban e não pode ser excluído.', 
        HttpStatus.BAD_REQUEST
      );
    }

    return await this.prisma.contact.delete({
      where: { number_userId: { number, userId } },
    });
  }
}