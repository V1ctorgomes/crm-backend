import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSendQueueService } from './whatsapp-send-queue.service';
import { WhatsappInstanceHealthService } from './whatsapp-instance-health.service';
import { R2Service } from './r2.service'; // Necessário injetar aqui
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, DeletionAuditModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, R2Service, WhatsappSendQueueService, WhatsappInstanceHealthService],
  exports: [WhatsappService],
})
export class WhatsappModule {}