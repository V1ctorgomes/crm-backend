import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompanyCrudService } from './company-crud.service';
import { CompanyContactsService } from './company-contacts.service';
import { BrasilApiCnpjService } from './brasilapi-cnpj.service';
import { CompaniesController } from './companies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';

@Module({
  imports: [PrismaModule, AuthModule, DeletionAuditModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyCrudService, CompanyContactsService, BrasilApiCnpjService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
