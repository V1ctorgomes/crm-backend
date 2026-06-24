import { Injectable, Logger } from '@nestjs/common';
import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import {
  extractMessageData,
  isMessageWebhookEvent,
  parseConnectionState,
  parseWebhookEnvelope,
} from './whatsapp-webhook-connection.parser';
import { parseInboundMessage } from './whatsapp-webhook-message.parser';
import { WhatsappWebhookInboundMediaService } from './whatsapp-webhook-inbound-media.service';
import { WhatsappWebhookInboundPersistService } from './whatsapp-webhook-inbound-persist.service';

@Injectable()
export class WhatsappWebhookInboundService {
  private readonly logger = new Logger(WhatsappWebhookInboundService.name);

  constructor(
    private readonly instanceHealth: WhatsappInstanceHealthService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly mediaService: WhatsappWebhookInboundMediaService,
    private readonly persistService: WhatsappWebhookInboundPersistService,
  ) {}

  async processWebhook(payload: any) {
    const envelope = parseWebhookEnvelope(payload);
    if (!envelope) return;

    const { instanceName, eventName } = envelope;

    if (eventName === 'connection.update') {
      if (instanceName) {
        this.instanceHealth.recordConnectionUpdate(instanceName, parseConnectionState(payload));
      }
      return;
    }

    if (!isMessageWebhookEvent(eventName)) {
      return;
    }

    const msgData = extractMessageData(payload);
    if (!msgData) return;

    const userIds = await this.instanceResolver.getInboundMessageUserIds(instanceName);
    if (!userIds.length) {
      this.logger.warn(`Webhook ignorado: instância "${instanceName}" não existe no CRM.`);
      return;
    }

    const primaryUserId = userIds[0];
    const parsed = parseInboundMessage(msgData, eventName, primaryUserId);
    if (!parsed) return;

    const { mediaUrl, text } = await this.mediaService.resolveMediaUrl(parsed, msgData, instanceName, primaryUserId);

    if (eventName === 'messages.upsert' || eventName === 'send.message') {
      await this.persistService.processUpsertForUsers(
        userIds,
        instanceName,
        eventName,
        payload,
        parsed,
        mediaUrl,
        text,
      );
    } else {
      this.persistService.emitMessageUpdate(payload, eventName, primaryUserId);
    }
  }
}
