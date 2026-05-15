import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { BrasilApiCnpjService } from './brasilapi-cnpj.service';
import { CompaniesController } from './companies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, BrasilApiCnpjService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
