import { Module } from '@nestjs/common';

import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappContactsController } from './whatsapp-contacts.controller';
import { WhatsappMessagingController } from './whatsapp-messaging.controller';

import { WhatsappService } from './whatsapp.service';

import { WhatsappSendQueueService } from './whatsapp-send-queue.service';

import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';

import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';

import { WhatsappRealtimeStreamService } from './whatsapp-realtime-stream.service';

import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';

import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';

import { WhatsappProfileService } from './whatsapp-profile.service';

import { WhatsappRecipientCheckService } from './whatsapp-recipient-check.service';

import { WhatsappWebhookInboundService } from './whatsapp-webhook-inbound.service';

import { WhatsappWebhookInboundMediaService } from './whatsapp-webhook-inbound-media.service';

import { WhatsappWebhookInboundPersistService } from './whatsapp-webhook-inbound-persist.service';

import { WhatsappOutboundMessagingService } from './whatsapp-outbound-messaging.service';

import { WhatsappTextSendService } from './whatsapp-text-send.service';

import { WhatsappMediaSendService } from './whatsapp-media-send.service';

import { WhatsappContactsService } from './whatsapp-contacts.service';

import { ContactsListService } from './contacts-list.service';

import { ContactsHistoryService } from './contacts-history.service';

import { WhatsappGroupsService } from './whatsapp-groups.service';

import { WhatsappMessageActionsService } from './whatsapp-message-actions.service';

import { StorageModule } from '../storage/storage.module';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from '../auth/auth.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';



@Module({

  imports: [PrismaModule, AuthModule, NotificationsModule, DeletionAuditModule, StorageModule],

  controllers: [WhatsappWebhookController, WhatsappContactsController, WhatsappMessagingController],

  providers: [

    WhatsappService,

    WhatsappSendQueueService,

    WhatsappInstanceHealthService,

    WhatsappEvolutionCredentialsService,

    WhatsappRealtimeStreamService,

    WhatsappInstanceResolverService,

    WhatsappGroupSubjectService,

    WhatsappProfileService,

    WhatsappRecipientCheckService,

    WhatsappWebhookInboundService,

    WhatsappWebhookInboundMediaService,

    WhatsappWebhookInboundPersistService,

    WhatsappOutboundMessagingService,

    WhatsappTextSendService,

    WhatsappMediaSendService,

    WhatsappContactsService,

    ContactsListService,

    ContactsHistoryService,

    WhatsappGroupsService,

    WhatsappMessageActionsService,

  ],

  exports: [WhatsappService],

})

export class WhatsappModule {}

