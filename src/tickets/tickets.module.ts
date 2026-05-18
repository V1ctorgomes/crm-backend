import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Service } from '../whatsapp/r2.service';
import { AuthModule } from '../auth/auth.module';
import { TicketCatalogModule } from '../ticket-catalog/ticket-catalog.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, TicketCatalogModule, DeletionAuditModule],
  providers: [TicketsService, R2Service],
  controllers: [TicketsController],
})
export class TicketsModule {}