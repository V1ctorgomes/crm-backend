import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { R2Service } from './r2.service'; // Necessário injetar aqui
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, R2Service], // Adicionado o R2Service
  exports: [WhatsappService],
})
export class WhatsappModule {}