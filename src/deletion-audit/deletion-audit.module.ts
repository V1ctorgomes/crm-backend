import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeletionAuditService } from './deletion-audit.service';
import { DeletionRevertService } from './deletion-revert.service';
import { InstanceRevertService } from './revert/instance-revert.service';
import { RevertDispatcherService } from './revert/revert-dispatcher.service';

@Module({
  imports: [PrismaModule],
  providers: [DeletionAuditService, DeletionRevertService, RevertDispatcherService, InstanceRevertService],
  exports: [DeletionAuditService, DeletionRevertService],
})
export class DeletionAuditModule {}
