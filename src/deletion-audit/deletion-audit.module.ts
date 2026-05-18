import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeletionAuditService } from './deletion-audit.service';

@Module({
  imports: [PrismaModule],
  providers: [DeletionAuditService],
  exports: [DeletionAuditService],
})
export class DeletionAuditModule {}
