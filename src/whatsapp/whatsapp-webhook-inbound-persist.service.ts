import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { WhatsappRealtimeStreamService } from './whatsapp-realtime-stream.service';
import { WhatsappProfileService } from './whatsapp-profile.service';
import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';
import { buildScopedMessageId } from './whatsapp-contact-jid.util';
import type { MessageWebhookEvent } from './whatsapp-webhook-connection.parser';
import type { ParsedInboundMessage } from './whatsapp-webhook-message.parser';

@Injectable()
export class WhatsappWebhookInboundPersistService {
  private readonly logger = new Logger(WhatsappWebhookInboundPersistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly realtimeStream: WhatsappRealtimeStreamService,
    private readonly profileService: WhatsappProfileService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
  ) {}

  async processUpsertForUsers(
    userIds: string[],
    instanceName: string,
    eventName: MessageWebhookEvent,
    payload: any,
    parsed: ParsedInboundMessage,
    mediaUrl: string | undefined,
    text: string,
  ): Promise<void> {
    for (const userId of userIds) {
      let notifyInboundPush = false;
      let inboundPushPreview = '';

      try {
        const scopedWaId = parsed.waId ? buildScopedMessageId(userId, parsed.waId) : undefined;
        const msgExists = scopedWaId
          ? await this.prisma.message.findUnique({ where: { id: scopedWaId } })
          : null;

        const existingContact = await this.prisma.contact.findUnique({
          where: { number_userId: { number: parsed.contactNumber, userId } },
        });
        let picUrl = existingContact?.profilePictureUrl || undefined;

        if (!picUrl) {
          picUrl = await this.profileService.fetchProfilePicture(parsed.contactNumber, instanceName);
        }

        const finalSidebarText = text || parsed.fallbackSidebarText;

        const needsGroupSubject =
          parsed.isGroupJid &&
          (!existingContact ||
            this.groupSubjectService.shouldReplaceAutoGroupDisplayName(existingContact?.name, parsed.contactNumber));

        let fetchedGroupSubject: string | undefined;
        if (needsGroupSubject) {
          fetchedGroupSubject = await this.groupSubjectService.tryFetchGroupSubject(instanceName, parsed.contactNumber, {
            retries: 3,
          });
        }

        let newGroupResolvedName: string | undefined;
        if (parsed.isGroupJid && !existingContact) {
          const short = parsed.contactNumber.replace(/\D/g, '').slice(-6);
          newGroupResolvedName = fetchedGroupSubject || `Grupo (${short})`;
        }

        const groupNameUpdate: Record<string, string> =
          parsed.isGroupJid &&
          existingContact &&
          this.groupSubjectService.shouldReplaceAutoGroupDisplayName(existingContact.name, parsed.contactNumber) &&
          fetchedGroupSubject
            ? { name: fetchedGroupSubject }
            : {};

        await this.prisma.contact.upsert({
          where: { number_userId: { number: parsed.contactNumber, userId } },
          update: {
            lastMessage: finalSidebarText,
            lastMessageTime: new Date(),
            instanceName,
            ...(picUrl && { profilePictureUrl: picUrl }),
            ...groupNameUpdate,
          },
          create: {
            userId,
            number: parsed.contactNumber,
            name: parsed.isGroupJid ? newGroupResolvedName ?? 'Grupo' : parsed.pushName || parsed.contactNumber,
            lastMessage: finalSidebarText,
            instanceName,
            profilePictureUrl: picUrl || null,
          },
        });

        if (needsGroupSubject && !fetchedGroupSubject) {
          const inst = instanceName;
          const cn = parsed.contactNumber;
          const uid = userId;
          setTimeout(
            () => void this.groupSubjectService.retryResolveGroupSubjectIfPlaceholder(uid, inst, cn),
            5000,
          );
        }

        if (scopedWaId && !msgExists && !parsed.isSelfEchoEvent) {
          try {
            await this.prisma.message.create({
              data: {
                id: scopedWaId,
                userId,
                instanceName,
                contactNumber: parsed.contactNumber,
                text,
                type: parsed.isFromMe ? 'sent' : 'received',
                timestamp: new Date(),
                isMedia: parsed.isMedia,
                mediaData: mediaUrl || null,
                mimeType: parsed.mimeType || null,
                fileName: parsed.fileName || null,
                groupSenderLabel: parsed.groupSenderLabel || null,
                messageKind: parsed.extracted.messageKind,
              },
            });
            if (!parsed.isFromMe && eventName === 'messages.upsert') {
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
            where: { number_userId: { number: parsed.contactNumber, userId } },
            select: { name: true },
          });
          const title = row?.name?.trim() || (parsed.isGroupJid ? 'Grupo WhatsApp' : parsed.pushName);
          const preview =
            (parsed.isGroupJid && parsed.groupSenderLabel ? `${parsed.groupSenderLabel}: ` : '') + inboundPushPreview;
          void this.pushNotifications.notifyWhatsappInbound(userId, {
            contactName: title,
            contactNumber: parsed.contactNumber,
            preview,
          });
        }
      } catch (e) {
        this.logger.error(`Erro no processamento do Webhook (userId=${userId})`, e);
      }
    }
  }

  emitMessageUpdate(payload: any, eventName: string, primaryUserId: string): void {
    this.realtimeStream.emit({ ...payload, event: eventName, _crmUserId: primaryUserId });
  }
}
