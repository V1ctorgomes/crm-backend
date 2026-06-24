import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { ReportsWhatsappService } from './reports-whatsapp.service';
import { ReportsTicketsService } from './reports-tickets.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [PrismaModule],
  providers: [ReportsService, ReportsWhatsappService, ReportsTicketsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
