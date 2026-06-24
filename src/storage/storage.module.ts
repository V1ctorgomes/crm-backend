import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Service } from './r2.service';

@Module({
  imports: [PrismaModule],
  providers: [R2Service],
  exports: [R2Service],
})
export class StorageModule {}
