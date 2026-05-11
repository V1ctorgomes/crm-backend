import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketCatalogService } from './ticket-catalog.service';
import { TicketCatalogController } from './ticket-catalog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TicketCatalogController],
  providers: [TicketCatalogService],
  exports: [TicketCatalogService],
})
export class TicketCatalogModule {}
