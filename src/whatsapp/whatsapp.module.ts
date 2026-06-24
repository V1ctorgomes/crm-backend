import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
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
import { WhatsappOutboundMessagingService } from './whatsapp-outbound-messaging.service';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { WhatsappGroupsService } from './whatsapp-groups.service';
import { WhatsappMessageActionsService } from './whatsapp-message-actions.service';
import { R2Service } from './r2.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, DeletionAuditModule],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    R2Service,
    WhatsappSendQueueService,
    WhatsappInstanceHealthService,
    WhatsappEvolutionCredentialsService,
    WhatsappRealtimeStreamService,
    WhatsappInstanceResolverService,
    WhatsappGroupSubjectService,
    WhatsappProfileService,
    WhatsappRecipientCheckService,
    WhatsappWebhookInboundService,
    WhatsappOutboundMessagingService,
    WhatsappContactsService,
    WhatsappGroupsService,
    WhatsappMessageActionsService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
