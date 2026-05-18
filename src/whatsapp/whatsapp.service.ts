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

  /** Cache curto das credenciais da Evolution (guardadas em BD por Developer → Provedores). */
  private evolutionCredsCache: { baseUrl: string; apiKey: string; expiresAt: number } | null = null;
  private static readonly EVOLUTION_CREDS_TTL_MS = 30_000;

  private async getEvolutionCreds(): Promise<{ baseUrl: string; apiKey: string }> {
    const now = Date.now();
    if (this.evolutionCredsCache && this.evolutionCredsCache.expiresAt > now) {
      return { baseUrl: this.evolutionCredsCache.baseUrl, apiKey: this.evolutionCredsCache.apiKey };
    }
    const provider = await this.prisma.provider.findUnique({ where: { name: 'evolution' } });
    const envUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const envKey = String(process.env.EVOLUTION_API_KEY || '');
    const baseUrl = (provider?.baseUrl?.replace(/\/$/, '') || envUrl).trim();
    const apiKey = (provider?.apiKey || envKey).trim();
    if (!baseUrl || !apiKey) {
      throw new HttpException(
        'Evolution API não configurada. Configure em Developer → Provedores.',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.evolutionCredsCache = { baseUrl, apiKey, expiresAt: now + WhatsappService.EVOLUTION_CREDS_TTL_MS };
    return { baseUrl, apiKey };
  }

  /** Janelas de tempo alinhadas ao WhatsApp (apagar / editar). */
  private static readonly WA_DELETE_MAX_MS = 50 * 60 * 60 * 1000; // 50 h
  private static readonly WA_EDIT_MAX_MS = 14 * 60 * 1000; // 14 min

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

  /**
   * Multer/browsers por vezes enviam gravações como `application/octet-stream`.
   * Sem `audio/*` o CRM trata como documento e a Evolution cai no fallback errado (WebM como doc não chega ao WhatsApp).
   */
  private resolveUploadedMimeType(fileName: string, declaredMime: string): string {
    const d = String(declaredMime || '').trim();
    const lower = d.toLowerCase();
    const fn = String(fileName || '').toLowerCase();
    const ext = fn.includes('.') ? fn.slice(fn.lastIndexOf('.') + 1) : '';

    if (lower && lower !== 'application/octet-stream' && lower !== 'binary/octet-stream') {
      return d;
    }

    const map: Record<string, string> = {
      webm: 'audio/webm',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      opus: 'audio/ogg',
      ogg: 'audio/ogg',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
    };
    if (ext && map[ext]) return map[ext];

    return d || 'application/octet-stream';
  }

  /**
   * Ficheiros `.webm` escolhidos pelo botão de anexar documento vêm quase sempre como `video/webm`.
   * O envio pela Evolution como **vídeo** (sem faixa de vídeo) não chega ao WhatsApp; tratar como áudio/nota.
   */
  private coerceWebmAttachmentToAudioIfNeeded(fileName: string, mime: string): string {
    const fn = String(fileName || '').toLowerCase();
    const base = String(mime || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (!fn.endsWith('.webm')) return mime;
    if (base === 'video/webm' || base === 'application/octet-stream') {
      return 'audio/webm';
    }
    return mime;
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
      const { baseUrl, apiKey } = await this.getEvolutionCreds();
      const response = await axios.post(
        `${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
        { number },
        { headers: { apikey: apiKey } }
      );
      return response.data?.profilePictureUrl || undefined;
    } catch {
      return undefined;
    }
  }

  private isGroupRemoteJid(remoteJid: string): boolean {
    return String(remoteJid || '').toLowerCase().endsWith('@g.us');
  }

  /**
   * Chave única na BD: JID do grupo sempre em minúsculas (evita duplicados @g.us vs @G.us);
   * conversas 1:1 só com dígitos (parte antes do @).
   */
  private normalizeStoredContactKey(key: string): string {
    const k = String(key || '').trim();
    if (!k) return k;
    if (k.toLowerCase().endsWith('@g.us')) return k.toLowerCase();
    const beforeAt = k.split('@')[0] || k;
    return beforeAt.replace(/\D/g, '');
  }

  /** Rejeita valores que são JID ou id numérico, não o nome legível do grupo. */
  private sanitizeWhatsAppGroupSubject(candidate: string | undefined, groupJid: string): string | undefined {
    const s = typeof candidate === 'string' ? candidate.trim() : '';
    if (!s) return undefined;
    const gj = String(groupJid || '').trim().toLowerCase();
    if (s.toLowerCase() === gj) return undefined;
    if (s.toLowerCase().endsWith('@g.us')) return undefined;
    if (s.toLowerCase().includes('@s.whatsapp.net')) return undefined;
    const onlyDigits = s.replace(/\D/g, '');
    if (onlyDigits.length >= 14 && onlyDigits === s.replace(/[^\d]/g, '')) return undefined;
    return s;
  }

  /** Nome claramente automático ou o próprio JID — tentamos obter o subject na Evolution. */
  private shouldReplaceAutoGroupDisplayName(name: string | null | undefined, groupJid: string): boolean {
    const n = String(name ?? '').trim();
    if (!n) return true;
    if (n.toLowerCase() === String(groupJid).trim().toLowerCase()) return true;
    if (n.toLowerCase().includes('@g.us')) return true;
    if (/^grupo\s*whatsapp\s*$/i.test(n)) return true;
    if (/^grupo\s*\(\d+\)\s*$/i.test(n)) return true;
    const digits = n.replace(/\D/g, '');
    if (digits.length >= 14 && digits === n.replace(/[^\d]/g, '')) return true;
    return false;
  }

  /** Chave do contacto na BD: JID completo (normalizado) para grupos; só dígitos para 1:1. */
  private contactKeyFromRemoteJid(remoteJid: string): string {
    const raw = String(remoteJid || '').trim();
    if (this.isGroupRemoteJid(raw)) return raw.toLowerCase();
    return raw.split('@')[0].replace(/\D/g, '');
  }

  /** Valor do campo `number` nos pedidos à Evolution (texto/mídia). */
  private evolutionSendNumber(contactKey: string): string {
    const k = String(contactKey || '').trim();
    if (k.toLowerCase().endsWith('@g.us')) return k;
    return k.replace(/\D/g, '');
  }

  private async tryFetchGroupSubject(instanceName: string, groupJid: string): Promise<string | undefined> {
    const gj = this.normalizeStoredContactKey(groupJid);
    try {
      const { baseUrl, apiKey } = await this.getEvolutionCreds();
      const inst = encodeURIComponent(instanceName);
      const headers = { apikey: apiKey };
      let res;
      try {
        res = await axios.get(`${baseUrl}/group/participants/${inst}`, {
          params: { groupJid: gj },
          headers,
        });
      } catch {
        res = await axios.post(
          `${baseUrl}/group/participants/${inst}`,
          { groupJid: gj },
          { headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
      const d = res.data;
      const candidates: unknown[] = [];
      const push = (v: unknown) => {
        if (v === undefined || v === null) return;
        candidates.push(v);
      };
      if (d && typeof d === 'object') {
        const o = d as Record<string, unknown>;
        push(o.subject);
        push(o.groupSubject);
        push(o.groupName);
        const data = o.data;
        if (data && typeof data === 'object') {
          const inner = data as Record<string, unknown>;
          push(inner.subject);
          push(inner.groupSubject);
        }
        const chat = o.chat;
        if (chat && typeof chat === 'object') {
          const c = chat as Record<string, unknown>;
          push(c.subject);
        }
        const meta = o.groupMetadata;
        if (meta && typeof meta === 'object') {
          const m = meta as Record<string, unknown>;
          push(m.subject);
        }
      }
      for (const c of candidates) {
        const raw = typeof c === 'string' ? c : String(c);
        const sanitized = this.sanitizeWhatsAppGroupSubject(raw, gj);
        if (sanitized) return sanitized;
      }
    } catch {
      /* ignorar */
    }
    return undefined;
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
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const isGroupJid = this.isGroupRemoteJid(remoteJid);
    const contactNumber = this.contactKeyFromRemoteJid(remoteJid);
    const isFromMe = Boolean(msgData.key.fromMe);
    const waId = msgData.key.id ? String(msgData.key.id) : undefined;
    const scopedWaId = waId ? this.buildScopedMessageId(userId, waId) : undefined;
    const participantJid = msgData.key?.participant ? String(msgData.key.participant) : '';
    const pushName = msgData.pushName ? String(msgData.pushName) : contactNumber;
    const groupSenderLabel =
      isGroupJid && !isFromMe
        ? (() => {
            const byPush = String(pushName || '').trim();
            if (byPush && byPush !== contactNumber) return byPush;
            const tail = participantJid.split('@')[0];
            return tail || undefined;
          })()
        : undefined;

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
          const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.getEvolutionCreds();
          const response = await axios.post(
            `${evoBaseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
            { message: msgData },
            { headers: { 'Content-Type': 'application/json', apikey: evoApiKey } }
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

        let fetchedGroupSubject: string | undefined;
        if (
          isGroupJid &&
          (!existingContact ||
            this.shouldReplaceAutoGroupDisplayName(existingContact?.name, contactNumber))
        ) {
          fetchedGroupSubject = await this.tryFetchGroupSubject(instanceName, contactNumber);
        }

        let newGroupResolvedName: string | undefined;
        if (isGroupJid && !existingContact) {
          const short = contactNumber.replace(/\D/g, '').slice(-6);
          newGroupResolvedName = fetchedGroupSubject || `Grupo (${short})`;
        }

        const groupNameUpdate: Record<string, string> =
          isGroupJid &&
          existingContact &&
          this.shouldReplaceAutoGroupDisplayName(existingContact.name, contactNumber) &&
          fetchedGroupSubject
            ? { name: fetchedGroupSubject }
            : {};

        await this.prisma.contact.upsert({
          where: { number_userId: { number: contactNumber, userId } },
          update: {
            lastMessage: finalSidebarText,
            lastMessageTime: new Date(),
            instanceName,
            ...(picUrl && { profilePictureUrl: picUrl }),
            ...groupNameUpdate,
          },
          create: {
            userId,
            number: contactNumber,
            name: isGroupJid ? newGroupResolvedName ?? 'Grupo' : pushName || contactNumber,
            lastMessage: finalSidebarText,
            instanceName,
            profilePictureUrl: picUrl || null,
          },
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
                groupSenderLabel: groupSenderLabel || null,
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
        if (groupSenderLabel) {
          msgData.groupSenderLabel = groupSenderLabel;
        }

        if (isMedia) {
          msgData.customMedia = { isMedia, mediaData: mediaUrl, mimeType, fileName, text };
        }
      }

      this.messageSubject.next({ ...payload, _crmUserId: userId });

      if (notifyInboundPush) {
        const row = await this.prisma.contact.findUnique({
          where: { number_userId: { number: contactNumber, userId } },
          select: { name: true },
        });
        const title = row?.name?.trim() || (isGroupJid ? 'Grupo WhatsApp' : pushName);
        const preview =
          (isGroupJid && groupSenderLabel ? `${groupSenderLabel}: ` : '') + inboundPushPreview;
        void this.pushNotifications.notifyWhatsappInbound(userId, {
          contactName: title,
          contactNumber,
          preview,
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
    const contactKey = this.normalizeStoredContactKey(String(number ?? '').trim());
    const evoNumber = this.evolutionSendNumber(contactKey);
    if (!evoNumber) {
      throw new HttpException('Número ou grupo inválido para envio.', HttpStatus.BAD_REQUEST);
    }
    try {
      const { baseUrl, apiKey } = await this.getEvolutionCreds();
      const response = await axios.post(
        `${baseUrl}/message/sendText/${instanceName}`,
        { number: evoNumber, text },
        { headers: { apikey: apiKey } }
      );
      const waId = response.data?.key?.id;

      let createDisplayName: string | undefined;
      if (this.isGroupRemoteJid(contactKey)) {
        createDisplayName =
          (await this.tryFetchGroupSubject(instanceName, contactKey)) || 'Grupo WhatsApp';
      }

      await this.prisma.contact.upsert({
        where: { number_userId: { number: contactKey, userId } },
        update: { lastMessage: text, lastMessageTime: new Date(), instanceName },
        create: {
          number: contactKey,
          userId,
          name: createDisplayName ?? contactKey,
          lastMessage: text,
          instanceName,
        },
      });

      if (waId) {
        try {
          await this.prisma.message.create({
            data: {
              id: this.buildScopedMessageId(userId, String(waId)),
              userId,
              instanceName,
              contactNumber: contactKey,
              text,
              type: 'sent',
              timestamp: new Date(),
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }
      return {
        success: true,
        data: response.data,
        messageId: waId ? this.buildScopedMessageId(userId, String(waId)) : undefined,
      };
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        e?.message;
      this.logger.error(`Evolution sendText falhou (${instanceName}): ${detail}`);
      throw new HttpException(detail || 'Erro ao enviar pela Evolution.', HttpStatus.BAD_REQUEST);
    }
  }

  async sendMedia(userId: string, number: string, file: any, caption: string, requestedInstanceName?: string) {
    const instanceName = requestedInstanceName || await this.getDefaultInstanceName(userId);
    const ownedInstance = await this.prisma.instance.findFirst({ where: { name: instanceName, userId } });
    if (!ownedInstance) throw new HttpException('Instância inválida.', HttpStatus.BAD_REQUEST);
    const contactKey = this.normalizeStoredContactKey(String(number ?? '').trim());
    const evoNumber = this.evolutionSendNumber(contactKey);
    if (!evoNumber) {
      throw new HttpException(
        'Número do contato em falta ou inválido no pedido. Recarregue a conversa e tente novamente.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let fileBuffer: Buffer | undefined = file?.buffer;
    if (!fileBuffer && file?.path) {
      const { readFile } = await import('fs/promises');
      fileBuffer = await readFile(file.path);
    }
    const fileOriginalName = String(file?.originalname || 'arquivo.bin');
    let fileMimeType = this.resolveUploadedMimeType(fileOriginalName, String(file?.mimetype || 'application/octet-stream'));
    fileMimeType = this.coerceWebmAttachmentToAudioIfNeeded(fileOriginalName, fileMimeType);

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new HttpException('Arquivo inválido, vazio ou não recebido pelo servidor.', HttpStatus.BAD_REQUEST);
    }

    // Chave determinística por chamada — qualquer reentrada/repetição sobrescreve o MESMO objeto,
    // em vez de criar duplicados no balde do R2.
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
    if (fileMimeType.startsWith('image')) { mediatype = 'image'; fallbackText = 'Imagem'; }
    else if (fileMimeType.startsWith('video')) { mediatype = 'video'; fallbackText = 'Vídeo'; }
    else if (fileMimeType.startsWith('audio')) { mediatype = 'audio'; fallbackText = 'Áudio'; }

    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.getEvolutionCreds();
    const evolutionHeaders = { apikey: evoApiKey };

    try {
      let response;

      const postSendMedia = async (mediatype: 'document' | 'audio' | 'image' | 'video') =>
        axios.post(
          `${evoBaseUrl}/message/sendMedia/${instanceName}`,
          {
            number: evoNumber,
            mediatype,
            mimetype: fileMimeType,
            caption: caption || '',
            media: mediaUrl,
            fileName: fileOriginalName,
          },
          { headers: evolutionHeaders },
        );

      // Gravações do browser vêm em WebM/Opus; `sendWhatsAppAudio` + encoding transcodifica para nota de voz (PTT).
      if (fileMimeType.startsWith('audio/')) {
        try {
          response = await axios.post(
            `${evoBaseUrl}/message/sendWhatsAppAudio/${instanceName}`,
            {
              number: evoNumber,
              audio: mediaUrl,
              encoding: true,
            },
            { headers: evolutionHeaders },
          );
        } catch (audioErr: any) {
          this.logger.warn(
            `sendWhatsAppAudio falhou (${audioErr?.response?.status}), a tentar sendMedia como áudio`,
            audioErr?.response?.data || audioErr?.message,
          );
          try {
            response = await postSendMedia('audio');
          } catch (audioMediaErr: any) {
            this.logger.warn(
              `sendMedia mediatype=audio falhou (${audioMediaErr?.response?.status}), fallback documento`,
              audioMediaErr?.response?.data || audioMediaErr?.message,
            );
            response = await postSendMedia('document');
          }
        }
      } else {
        response = await postSendMedia(mediatype as 'document' | 'image' | 'video');
      }

      const waId = response.data?.key?.id || Date.now().toString();

      let createDisplayNameMedia: string | undefined;
      if (this.isGroupRemoteJid(contactKey)) {
        createDisplayNameMedia =
          (await this.tryFetchGroupSubject(instanceName, contactKey)) || 'Grupo WhatsApp';
      }

      await this.prisma.contact.upsert({
        where: { number_userId: { number: contactKey, userId } },
        update: { lastMessage: caption || fallbackText, lastMessageTime: new Date(), instanceName },
        create: {
          number: contactKey,
          userId,
          name: createDisplayNameMedia ?? contactKey,
          lastMessage: caption || fallbackText,
          instanceName,
        },
      });

      const scopedId = this.buildScopedMessageId(userId, String(waId));
      try {
        await this.prisma.message.create({
          data: {
            id: scopedId,
            userId,
            instanceName,
            contactNumber: contactKey,
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

      return {
        success: true,
        id: String(waId),
        messageId: scopedId,
        mediaData: mediaUrl,
        mimeType: fileMimeType,
        fileName: fileOriginalName,
        isMedia: true,
      };
    } catch (error: any) {
      const detail =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        (Array.isArray(error?.response?.data?.message)
          ? error.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        error?.message;
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

  async getContacts(userId: string) {
    try {
      const rows = await this.prisma.contact.findMany({
        where: { userId },
        orderBy: { lastMessageTime: 'desc' },
        include: { companyLinks: { include: { company: true } } },
      });
      return rows.map(({ companyLinks, ...c }) => ({
        ...c,
        companies: (companyLinks || []).map((l) => ({
          id: l.company.id,
          legalName: l.company.legalName,
          tradeName: l.company.tradeName,
          cnpj: l.company.cnpj,
        })),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Histórico paginado (estilo WhatsApp): por defeito as últimas `limit` mensagens;
   * com `beforeMessageId`, mensagens mais antigas que essa (cursor).
   * Resposta: `{ messages, hasMoreOlder }` (mensagens em ordem cronológica crescente).
   */
  async getChatHistory(
    userId: string,
    number: string,
    opts?: { limit?: number; beforeMessageId?: string },
  ) {
    const contactNumber = this.normalizeStoredContactKey(String(number || '').trim());
    const msgVariants = this.contactNumberLookupVariants(contactNumber);
    const msgWhere =
      msgVariants.length === 1
        ? { userId, contactNumber }
        : { userId, OR: msgVariants.map((cn) => ({ contactNumber: cn })) };

    const rawLimit = opts?.limit ?? 80;
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 80, 1), 200);
    const take = limit + 1;
    const beforeId = opts?.beforeMessageId?.trim();

    try {
      if (beforeId) {
        const cursor = await this.prisma.message.findFirst({
          where: { ...msgWhere, id: beforeId },
          select: { id: true, timestamp: true },
        });
        if (!cursor) {
          return { messages: [], hasMoreOlder: false };
        }
        const older = await this.prisma.message.findMany({
          where: {
            AND: [
              msgWhere,
              {
                OR: [
                  { timestamp: { lt: cursor.timestamp } },
                  { AND: [{ timestamp: cursor.timestamp }, { id: { lt: cursor.id } }] },
                ],
              },
            ],
          },
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
          take,
        });
        const hasMoreOlder = older.length > limit;
        const page = hasMoreOlder ? older.slice(0, limit) : older;
        return { messages: page.reverse(), hasMoreOlder };
      }

      const recent = await this.prisma.message.findMany({
        where: msgWhere,
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take,
      });
      const hasMoreOlder = recent.length > limit;
      const page = hasMoreOlder ? recent.slice(0, limit) : recent;
      return { messages: page.reverse(), hasMoreOlder };
    } catch {
      return { messages: [], hasMoreOlder: false };
    }
  }

  async deleteConversation(userId: string, number: string) {
    const contactNumber = this.normalizeStoredContactKey(String(number || '').trim());
    const msgVariants = this.contactNumberLookupVariants(contactNumber);
    const msgWhere =
      msgVariants.length === 1
        ? { userId, contactNumber }
        : { userId, OR: msgVariants.map((cn) => ({ contactNumber: cn })) };
    try {
      const conversasPrefix = this.r2Service.conversasPath(userId, contactNumber);
      await this.r2Service.deleteFolder(conversasPrefix);

      await this.prisma.message.deleteMany({
        where: msgWhere,
      });
      
      try {
        await this.prisma.contact.update({ 
          where: { number_userId: { number: contactNumber, userId } }, 
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

  async createGroup(
    userId: string,
    body: { subject: string; participants: string[]; description?: string; instanceName?: string },
  ) {
    const subject = String(body.subject || '').trim();
    if (!subject) {
      throw new HttpException('Indique o nome do grupo.', HttpStatus.BAD_REQUEST);
    }
    if (subject.length > 25) {
      throw new HttpException('O nome do grupo tem no máximo 25 caracteres no WhatsApp.', HttpStatus.BAD_REQUEST);
    }
    const participants = (Array.isArray(body.participants) ? body.participants : [])
      .map((p) => String(p || '').replace(/\D/g, ''))
      .filter((d) => d.length >= 10);
    if (participants.length < 1) {
      throw new HttpException(
        'Indique pelo menos um número com WhatsApp (DDI + DDD + número, só dígitos) para criar o grupo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName = body.instanceName?.trim() || (await this.getDefaultInstanceName(userId));
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });

    const { baseUrl, apiKey } = await this.getEvolutionCreds();
    const payload: Record<string, unknown> = { subject, participants };
    const desc = String(body.description || '').trim();
    if (desc) payload.description = desc;

    let res;
    try {
      res = await axios.post(`${baseUrl}/group/create/${encodeURIComponent(instanceName)}`, payload, {
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Falha ao criar grupo na Evolution.';
      this.logger.warn(`createGroup Evolution: ${detail}`);
      throw new HttpException(String(detail), HttpStatus.BAD_REQUEST);
    }

    const d = res.data || {};
    const jidRaw = d.jid || d.groupJid || d.key?.remoteJid || d.id;
    const jidNorm = jidRaw ? String(jidRaw).trim() : '';
    const jid = jidNorm ? this.normalizeStoredContactKey(jidNorm) : '';
    if (!jid.toLowerCase().includes('@g.us')) {
      this.logger.warn('createGroup resposta inesperada', d);
      throw new HttpException(
        'A Evolution não devolveu o identificador do grupo. Verifique a versão da API e os logs.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.contact.upsert({
      where: { number_userId: { number: jid, userId } },
      update: {
        name: subject,
        lastMessage: 'Grupo criado',
        lastMessageTime: new Date(),
        instanceName,
      },
      create: {
        userId,
        number: jid,
        name: subject,
        lastMessage: 'Grupo criado',
        lastMessageTime: new Date(),
        instanceName,
      },
    });

    return { groupJid: jid, subject };
  }

  /**
   * Obtém foto (e, se o nome ainda for automático/JID, o subject) do grupo na Evolution e grava no contacto.
   */
  async syncGroupProfileFromWhatsApp(
    userId: string,
    body: { number: string; instanceName?: string },
  ) {
    const contactKey = this.normalizeStoredContactKey(String(body.number || '').trim());
    if (!this.isGroupRemoteJid(contactKey)) {
      throw new HttpException(
        'Só é possível sincronizar foto/nome para grupos WhatsApp (@g.us).',
        HttpStatus.BAD_REQUEST,
      );
    }
    const instanceName = body.instanceName?.trim() || (await this.getDefaultInstanceName(userId));
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });

    const existing = await this.prisma.contact.findUnique({
      where: { number_userId: { number: contactKey, userId } },
    });
    if (!existing) {
      throw new HttpException(
        'Contato de grupo não encontrado. Abra a conversa ou aguarde uma mensagem.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [picUrl, subjectFromApi] = await Promise.all([
      this.fetchProfilePicture(contactKey, instanceName),
      this.tryFetchGroupSubject(instanceName, contactKey),
    ]);

    const data: { profilePictureUrl?: string | null; name?: string } = {};
    if (picUrl) data.profilePictureUrl = picUrl;
    if (
      subjectFromApi &&
      this.shouldReplaceAutoGroupDisplayName(existing.name, contactKey)
    ) {
      data.name = subjectFromApi;
    }

    if (Object.keys(data).length === 0) {
      return {
        number: existing.number,
        name: existing.name,
        profilePictureUrl: existing.profilePictureUrl,
        updated: false as const,
      };
    }

    const updated = await this.prisma.contact.update({
      where: { number_userId: { number: contactKey, userId } },
      data,
    });
    return {
      number: updated.number,
      name: updated.name,
      profilePictureUrl: updated.profilePictureUrl,
      updated: true as const,
    };
  }

  async updateContact(userId: string, number: string, data: any) {
    const contactKey = this.normalizeStoredContactKey(String(number || '').trim());
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined && data.name !== null) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.cnpj !== undefined) updateData.cnpj = data.cnpj;
    if (data.contactKind !== undefined && data.contactKind !== null) {
      const k = String(data.contactKind).toUpperCase();
      if (k === 'UNKNOWN' || k === 'CUSTOMER' || k === 'INTERNAL') {
        updateData.contactKind = k;
      }
    }
    if (Object.keys(updateData).length === 0) {
      return await this.prisma.contact.findUniqueOrThrow({
        where: { number_userId: { number: contactKey, userId } },
      });
    }
    return await this.prisma.contact.update({
      where: { number_userId: { number: contactKey, userId } },
      data: updateData as any,
    });
  }

  async removeContact(userId: string, number: string) {
    const contactKey = this.normalizeStoredContactKey(String(number || '').trim());
    const contact = await this.prisma.contact.findUnique({
      where: { number_userId: { number: contactKey, userId } },
      include: { tickets: true }
    });

    if (!contact) {
      throw new HttpException('Contato não encontrado.', HttpStatus.NOT_FOUND);
    }

    if (contact.tickets && contact.tickets.length > 0) {
      throw new HttpException(
        'Este contato possui solicitações (OS) no Kanban e não pode ser excluído.', 
        HttpStatus.BAD_REQUEST
      );
    }

    return await this.prisma.contact.delete({
      where: { number_userId: { number: contactKey, userId } },
    });
  }

  private extractWaMessageId(userId: string, storedMessageId: string): string | null {
    const prefix = `${userId}:`;
    if (storedMessageId.startsWith(prefix)) return storedMessageId.slice(prefix.length);
    return null;
  }

  /** Variantes da chave do contacto para encontrar mensagens antigas (ex.: @G.us vs @g.us). */
  private contactNumberLookupVariants(contactNumber: string): string[] {
    const k = String(contactNumber || '').trim();
    if (!k.toLowerCase().endsWith('@g.us')) {
      return [this.normalizeStoredContactKey(k)];
    }
    const lower = k.toLowerCase();
    return [...new Set([lower, k, lower.replace(/@g\.us$/, '@G.us')])];
  }

  /** UI/SSE podem enviar só o id WA; na BD a chave é `userId:waId`. */
  private async findUserMessageForAction(userId: string, contactNumber: string, messageId: string) {
    const ids = messageId.includes(':')
      ? [messageId]
      : [messageId, this.buildScopedMessageId(userId, messageId)];
    const variants = this.contactNumberLookupVariants(contactNumber);
    return this.prisma.message.findFirst({
      where: {
        userId,
        id: { in: ids },
        OR: variants.map((cn) => ({ contactNumber: cn })),
      },
    });
  }

  private buildRemoteJid(contactNumber: string): string {
    const k = String(contactNumber || '').trim();
    if (k.toLowerCase().endsWith('@g.us')) return k.toLowerCase();
    const digits = k.replace(/\D/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  private async refreshContactLastMessage(userId: string, contactNumber: string) {
    const variants = this.contactNumberLookupVariants(contactNumber);
    const canonical = this.normalizeStoredContactKey(contactNumber);
    const msgWhere =
      variants.length === 1
        ? { userId, contactNumber: variants[0] }
        : { userId, OR: variants.map((cn) => ({ contactNumber: cn })) };
    const last = await this.prisma.message.findFirst({
      where: msgWhere,
      orderBy: { timestamp: 'desc' },
    });
    const preview =
      last?.text?.trim() ||
      (last?.isMedia ? 'Mídia' : '') ||
      '';
    try {
      await this.prisma.contact.update({
        where: { number_userId: { number: canonical, userId } },
        data: {
          lastMessage: preview,
          lastMessageTime: last?.timestamp ?? null,
        },
      });
    } catch {
      /* contato pode não existir */
    }
  }

  /**
   * Evolution API v2: DELETE /chat/deleteMessageForEveryone/{instance}
   * Só mensagens enviadas por nós (fromMe), dentro do limite de tempo do WhatsApp.
   */
  async deleteMessageForEveryone(
    userId: string,
    dto: { contactNumber: string; messageId: string; instanceName?: string },
  ) {
    const contactNumber = this.normalizeStoredContactKey(String(dto.contactNumber || '').trim());
    const msg = await this.findUserMessageForAction(userId, contactNumber, dto.messageId);
    if (!msg) throw new HttpException('Mensagem não encontrada.', HttpStatus.NOT_FOUND);
    if (msg.type !== 'sent') {
      throw new HttpException('Só pode apagar mensagens enviadas por si.', HttpStatus.BAD_REQUEST);
    }

    const ageDeleteMs = Date.now() - msg.timestamp.getTime();
    if (ageDeleteMs < 0 || ageDeleteMs > WhatsappService.WA_DELETE_MAX_MS) {
      throw new HttpException(
        'Só é possível apagar mensagens até 50 horas após o envio.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const waId = this.extractWaMessageId(userId, msg.id);
    if (!waId) {
      throw new HttpException(
        'Esta mensagem não tem ID do WhatsApp (histórico antigo). Não é possível apagar na Evolution.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName =
      dto.instanceName || msg.instanceName || (await this.getDefaultInstanceName(userId));
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });

    const remoteJid = this.buildRemoteJid(contactNumber);
    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.getEvolutionCreds();
    const evolutionHeaders = { apikey: evoApiKey, 'Content-Type': 'application/json' };

    try {
      await axios.delete(`${evoBaseUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
        headers: evolutionHeaders,
        data: {
          id: waId,
          remoteJid,
          fromMe: true,
          participant: '',
        },
      });
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        e?.message;
      this.logger.warn(`Evolution deleteMessageForEveryone: ${detail}`);
      throw new HttpException(detail || 'Erro ao apagar mensagem na Evolution.', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.message.delete({ where: { id: msg.id } });
    await this.refreshContactLastMessage(userId, contactNumber);
    return { success: true };
  }

  /**
   * Evolution API v2: POST /chat/updateMessage/{instance}
   */
  async updateMessageText(
    userId: string,
    dto: { contactNumber: string; messageId: string; text: string; instanceName?: string },
  ) {
    const text = String(dto.text ?? '').trim();
    if (!text) throw new HttpException('Texto inválido.', HttpStatus.BAD_REQUEST);

    const contactNumber = this.normalizeStoredContactKey(String(dto.contactNumber || '').trim());
    const msg = await this.findUserMessageForAction(userId, contactNumber, dto.messageId);
    if (!msg) throw new HttpException('Mensagem não encontrada.', HttpStatus.NOT_FOUND);
    if (msg.type !== 'sent') {
      throw new HttpException('Só pode editar mensagens enviadas por si.', HttpStatus.BAD_REQUEST);
    }
    if (msg.isMedia) {
      throw new HttpException('Não é possível editar mensagens de mídia.', HttpStatus.BAD_REQUEST);
    }

    const ageEditMs = Date.now() - msg.timestamp.getTime();
    if (ageEditMs < 0 || ageEditMs > WhatsappService.WA_EDIT_MAX_MS) {
      throw new HttpException(
        'Só é possível editar mensagens até 14 minutos após o envio.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const waId = this.extractWaMessageId(userId, msg.id);
    if (!waId) {
      throw new HttpException(
        'Esta mensagem não tem ID do WhatsApp (histórico antigo). Não é possível editar na Evolution.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName =
      dto.instanceName || msg.instanceName || (await this.getDefaultInstanceName(userId));
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });

    const remoteJid = this.buildRemoteJid(contactNumber);
    const evoNumber = this.evolutionSendNumber(contactNumber);
    const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.getEvolutionCreds();
    const evolutionHeaders = { apikey: evoApiKey, 'Content-Type': 'application/json' };

    try {
      await axios.post(
        `${evoBaseUrl}/chat/updateMessage/${encodeURIComponent(instanceName)}`,
        {
          number: evoNumber,
          text,
          key: {
            remoteJid,
            fromMe: true,
            id: waId,
          },
        },
        { headers: evolutionHeaders },
      );
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        (Array.isArray(e?.response?.data?.message)
          ? e.response.data.message.map((m: any) => m?.message || JSON.stringify(m)).join(', ')
          : null) ||
        e?.message;
      this.logger.warn(`Evolution updateMessage: ${detail}`);
      throw new HttpException(detail || 'Erro ao editar mensagem na Evolution.', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.message.update({
      where: { id: msg.id },
      data: { text },
    });
    await this.refreshContactLastMessage(userId, contactNumber);
    return { success: true };
  }
}