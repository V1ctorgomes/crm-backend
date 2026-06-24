import { Module } from '@nestjs/common';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { InstanceCrudService } from './instance-crud.service';
import { InstanceCreateService } from './instance-create.service';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, DeletionAuditModule],
  controllers: [InstancesController],
  providers: [InstancesService, InstanceCrudService, InstanceCreateService, InstanceEvolutionSyncService],
})
export class InstancesModule {}
