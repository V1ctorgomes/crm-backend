import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from './r2.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { extractInboundMessageContent, unwrapProtoMessage } from './whatsapp-inbound-extract';
import { normalizeWebhookEvent } from '../common/evolution-webhook.util';
import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { WhatsappRealtimeStreamService } from './whatsapp-realtime-stream.service';
import { WhatsappProfileService } from './whatsapp-profile.service';
import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';
import {
  buildScopedMessageId,
  contactKeyFromRemoteJid,
  isGroupRemoteJid,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappWebhookInboundService {
  private readonly logger = new Logger(WhatsappWebhookInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    private readonly pushNotifications: PushNotificationsService,
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly realtimeStream: WhatsappRealtimeStreamService,
    private readonly profileService: WhatsappProfileService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
  ) {}

  async processWebhook(payload: any) {
    if (!payload || !payload.event) {
      return;
    }

    const instanceName = String(payload.instance || '');
    const eventName = normalizeWebhookEvent(payload.event);

    if (eventName === 'connection.update') {
      if (instanceName) {
        const data = payload.data;
        const state =
          (data && typeof data === 'object' && (data as Record<string, unknown>).state) ||
          (data && typeof data === 'object' && (data as Record<string, unknown>).status) ||
          payload.state;
        this.instanceHealth.recordConnectionUpdate(instanceName, String(state ?? 'unknown'));
      }
      return;
    }

    const allowedEvents = ['messages.upsert', 'messages.update', 'send.message'];

    if (!allowedEvents.includes(eventName) || !payload.data) {
      return;
    }
    const userIds = await this.instanceResolver.getInboundMessageUserIds(instanceName);
    if (!userIds.length) {
      this.logger.warn(`Webhook ignorado: instância "${instanceName}" não existe no CRM.`);
      return;
    }
    const primaryUserId = userIds[0];
    const payloadData = payload.data;
    const msgData = Array.isArray(payloadData) ? payloadData[0] : payloadData;

    if (!msgData || !msgData.key) return;

    const remoteJid = String(msgData.key.remoteJid || '');
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const isGroupJid = isGroupRemoteJid(remoteJid);
    const contactNumber = contactKeyFromRemoteJid(remoteJid);
    const isFromMe = Boolean(msgData.key.fromMe);
    const waId = msgData.key.id ? String(msgData.key.id) : undefined;
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
    const isSelfEchoEvent = eventName === 'send.message';
    const primaryScopedWaId = waId ? buildScopedMessageId(primaryUserId, waId) : undefined;
    const primaryMsgExists = primaryScopedWaId
      ? await this.prisma.message.findUnique({ where: { id: primaryScopedWaId } })
      : null;

    const msgRaw = msgData.message;
    if (!msgRaw || typeof msgRaw !== 'object' || Object.keys(msgRaw).length === 0) {
      return;
    }

    const inner = unwrapProtoMessage(msgRaw);
    const extracted = extractInboundMessageContent(inner);
    if (extracted.skipPersist) {
      return;
    }

    let text = extracted.text;
    let mediaUrl: string | undefined;
    let mimeType: string | undefined = extracted.mimeType;
    let fileName: string | undefined = extracted.fileName;
    let isMedia = extracted.isMedia;
    let fallbackSidebarText = extracted.fallbackSidebar;

    if (extracted.isMedia && extracted.mediaObject) {
      if (primaryMsgExists) {
        mediaUrl = primaryMsgExists.mediaData || undefined;
      } else if (!isSelfEchoEvent) {
        try {
          const { baseUrl: evoBaseUrl, apiKey: evoApiKey } = await this.creds.get();
          const response = await axios.post(
            `${evoBaseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
            { message: msgData },
            { headers: { 'Content-Type': 'application/json', apikey: evoApiKey } },
          );

          if (response.data && response.data.base64) {
            const buffer = Buffer.from(String(response.data.base64), 'base64');
            const stableKey =
              primaryScopedWaId || (waId ? `${primaryUserId}_${contactNumber}_${waId}` : undefined);
            const mediaFolder = this.r2Service.conversasPath(primaryUserId, contactNumber);
            mediaUrl = await this.r2Service.uploadBuffer(
              buffer,
              fileName || 'arquivo.bin',
              mimeType || 'application/octet-stream',
              mediaFolder,
              stableKey,
            );
          }
        } catch (error) {
          this.logger.error('Erro ao baixar mídia da Evolution', error);
          text = 'Falha ao salvar mídia na nuvem';
        }
      }
    }

    if (!text && !isMedia) text = 'Mensagem não suportada';

    if (eventName === 'messages.upsert' || eventName === 'send.message') {
      for (const userId of userIds) {
        let notifyInboundPush = false;
        let inboundPushPreview = '';

        try {
          const scopedWaId = waId ? buildScopedMessageId(userId, waId) : undefined;
          const msgExists = scopedWaId
            ? await this.prisma.message.findUnique({ where: { id: scopedWaId } })
            : null;

          const existingContact = await this.prisma.contact.findUnique({
            where: { number_userId: { number: contactNumber, userId } },
          });
          let picUrl = existingContact?.profilePictureUrl || undefined;

          if (!picUrl) {
            picUrl = await this.profileService.fetchProfilePicture(contactNumber, instanceName);
          }

          const finalSidebarText = text || fallbackSidebarText;

          const needsGroupSubject =
            isGroupJid &&
            (!existingContact ||
              this.groupSubjectService.shouldReplaceAutoGroupDisplayName(existingContact?.name, contactNumber));

          let fetchedGroupSubject: string | undefined;
          if (needsGroupSubject) {
            fetchedGroupSubject = await this.groupSubjectService.tryFetchGroupSubject(instanceName, contactNumber, {
              retries: 3,
            });
          }

          let newGroupResolvedName: string | undefined;
          if (isGroupJid && !existingContact) {
            const short = contactNumber.replace(/\D/g, '').slice(-6);
            newGroupResolvedName = fetchedGroupSubject || `Grupo (${short})`;
          }

          const groupNameUpdate: Record<string, string> =
            isGroupJid &&
            existingContact &&
            this.groupSubjectService.shouldReplaceAutoGroupDisplayName(existingContact.name, contactNumber) &&
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

          if (needsGroupSubject && !fetchedGroupSubject) {
            const inst = instanceName;
            const cn = contactNumber;
            const uid = userId;
            setTimeout(
              () => void this.groupSubjectService.retryResolveGroupSubjectIfPlaceholder(uid, inst, cn),
              5000,
            );
          }

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
                  messageKind: extracted.messageKind,
                },
              });
              if (!isFromMe && eventName === 'messages.upsert') {
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

          this.realtimeStream.emit({ ...payload, event: eventName, _crmUserId: userId });

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
          this.logger.error(`Erro no processamento do Webhook (userId=${userId})`, e);
        }
      }
    } else {
      this.realtimeStream.emit({ ...payload, event: eventName, _crmUserId: primaryUserId });
    }
  }
}
