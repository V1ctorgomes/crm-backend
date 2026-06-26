import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { R2Service } from './r2.service';
import { R2ConfigService } from './r2-config.service';
import { R2UploadService } from './r2-upload.service';
import { R2DeleteService } from './r2-delete.service';
import { R2StreamService } from './r2-stream.service';
import { StorageAccessService } from './storage-access.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StorageController],
  providers: [
    R2ConfigService,
    R2UploadService,
    R2DeleteService,
    R2StreamService,
    StorageAccessService,
    R2Service,
  ],
  exports: [R2Service],
})
export class StorageModule {}
