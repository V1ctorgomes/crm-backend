import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { R2Service } from './r2.service'; // Necessário injetar aqui

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, R2Service], // Adicionado o R2Service
  exports: [WhatsappService],
})
export class WhatsappModule {}