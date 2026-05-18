import { Module } from '@nestjs/common';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, DeletionAuditModule],
  controllers: [InstancesController],
  providers: [InstancesService],
})
export class InstancesModule {}