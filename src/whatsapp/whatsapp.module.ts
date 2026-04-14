import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { R2Service } from './r2.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, R2Service],
  exports: [WhatsappService],
})
export class WhatsappModule {}