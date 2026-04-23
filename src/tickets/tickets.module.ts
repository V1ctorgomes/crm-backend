import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Service } from '../whatsapp/r2.service';

@Module({
  imports: [PrismaModule],
  providers: [TicketsService, R2Service],
  controllers: [TicketsController],
})
export class TicketsModule {}