import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Service } from './r2.service';
import { R2ConfigService } from './r2-config.service';
import { R2UploadService } from './r2-upload.service';
import { R2DeleteService } from './r2-delete.service';

@Module({
  imports: [PrismaModule],
  providers: [R2ConfigService, R2UploadService, R2DeleteService, R2Service],
  exports: [R2Service],
})
export class StorageModule {}
