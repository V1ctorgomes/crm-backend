import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

import { UsersAdminService } from './users-admin.service';
import { UsersAdminListService } from './users-admin-list.service';
import { UsersPasswordResetAdminService } from './users-password-reset-admin.service';
import { UsersAdminMutationsService } from './users-admin-mutations.service';

import { UsersProfileService } from './users-profile.service';

import { UsersController } from './users.controller';

import { PrismaModule } from '../prisma/prisma.module';

import { StorageModule } from '../storage/storage.module';

import { AuthModule } from '../auth/auth.module';

import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';



@Module({

  imports: [PrismaModule, AuthModule, DeletionAuditModule, StorageModule],

  controllers: [UsersController],

  providers: [
    UsersService,
    UsersAdminService,
    UsersAdminListService,
    UsersPasswordResetAdminService,
    UsersAdminMutationsService,
    UsersProfileService,
  ],

  exports: [UsersService],

})

export class UsersModule {}
