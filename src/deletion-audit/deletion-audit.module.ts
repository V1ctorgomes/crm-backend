import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeletionAuditService } from './deletion-audit.service';
import { DeletionRevertService } from './deletion-revert.service';

@Module({
  imports: [PrismaModule],
  providers: [DeletionAuditService, DeletionRevertService],
  exports: [DeletionAuditService, DeletionRevertService],
})
export class DeletionAuditModule {}
