import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

import { UsersAdminService } from './users-admin.service';

import { UsersProfileService } from './users-profile.service';

import { UsersController } from './users.controller';

import { PrismaModule } from '../prisma/prisma.module';

import { StorageModule } from '../storage/storage.module';

import { AuthModule } from '../auth/auth.module';

import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';



@Module({

  imports: [PrismaModule, AuthModule, DeletionAuditModule, StorageModule],

  controllers: [UsersController],

  providers: [UsersService, UsersAdminService, UsersProfileService],

  exports: [UsersService],

})

export class UsersModule {}

