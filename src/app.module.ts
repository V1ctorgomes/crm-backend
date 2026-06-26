// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { TicketsModule } from './tickets/tickets.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { InstancesModule } from './instances/instances.module';
import { ProxiesModule } from './proxies/proxies.module';
import { ProvidersModule } from './providers/providers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
    }),
    PrismaModule,
    CustomersModule, 
    AuthModule, 
    NotificationsModule,
    WhatsappModule,
    TicketsModule,
    CompaniesModule,
    UsersModule,
    InstancesModule,
    ProxiesModule,
    ProvidersModule,
    ReportsModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}