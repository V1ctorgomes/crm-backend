import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import type { ChatPresenceType } from './whatsapp-typing.util';
import { WhatsappInstanceHealthService, type InstanceHealthSnapshot } from './whatsapp-instance-health.service';
import { WhatsappRealtimeStreamService } from './whatsapp-realtime-stream.service';
import { WhatsappWebhookInboundService } from './whatsapp-webhook-inbound.service';
import { WhatsappOutboundMessagingService } from './whatsapp-outbound-messaging.service';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { WhatsappGroupsService } from './whatsapp-groups.service';
import { WhatsappMessageActionsService } from './whatsapp-message-actions.service';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly realtimeStream: WhatsappRealtimeStreamService,
    private readonly webhookInbound: WhatsappWebhookInboundService,
    private readonly outboundMessaging: WhatsappOutboundMessagingService,
    private readonly contacts: WhatsappContactsService,
    private readonly groups: WhatsappGroupsService,
    private readonly messageActions: WhatsappMessageActionsService,
  ) {}

  get messageStream$(): Observable<Record<string, unknown>> {
    return this.realtimeStream.messageStream$;
  }

  async getInstancesHealthForUser(_userId: string): Promise<InstanceHealthSnapshot[]> {
    const instances = await this.prisma.instance.findMany({
      select: { name: true },
      orderBy: { createdAt: 'desc' },
    });
    return instances.map((i) => this.instanceHealth.getSnapshot(i.name));
  }

  processWebhook(payload: any) {
    return this.webhookInbound.processWebhook(payload);
  }

  sendChatPresence(
    userId: string,
    number: string,
    presence: ChatPresenceType,
    requestedInstanceName?: string,
  ) {
    return this.outboundMessaging.sendChatPresence(userId, number, presence, requestedInstanceName);
  }

  sendText(userId: string, number: string, text: string, requestedInstanceName?: string) {
    return this.outboundMessaging.sendText(userId, number, text, requestedInstanceName);
  }

  sendMedia(userId: string, number: string, file: any, caption: string, requestedInstanceName?: string) {
    return this.outboundMessaging.sendMedia(userId, number, file, caption, requestedInstanceName);
  }

  getContacts(userId: string) {
    return this.contacts.getContacts(userId);
  }

  getChatHistory(
    userId: string,
    number: string,
    opts?: { limit?: number; beforeMessageId?: string },
  ) {
    return this.contacts.getChatHistory(userId, number, opts);
  }

  deleteConversation(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    return this.contacts.deleteConversation(userId, number, actor, rawReason);
  }

  updateContact(userId: string, number: string, data: Record<string, unknown>) {
    return this.contacts.updateContact(userId, number, data);
  }

  removeContact(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    return this.contacts.removeContact(userId, number, actor, rawReason);
  }

  createGroup(
    userId: string,
    body: { subject: string; participants: string[]; description?: string; instanceName?: string },
  ) {
    return this.groups.createGroup(userId, body);
  }

  syncGroupProfileFromWhatsApp(userId: string, body: { number: string; instanceName?: string }) {
    return this.groups.syncGroupProfileFromWhatsApp(userId, body);
  }

  deleteMessageForEveryone(
    userId: string,
    dto: { contactNumber: string; messageId: string; instanceName?: string; reason?: string },
    actor: AuditActor,
  ) {
    return this.messageActions.deleteMessageForEveryone(userId, dto, actor);
  }

  updateMessageText(
    userId: string,
    dto: { contactNumber: string; messageId: string; text: string; instanceName?: string },
  ) {
    return this.messageActions.updateMessageText(userId, dto);
  }
}
