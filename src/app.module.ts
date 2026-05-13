// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';
import { InstancesModule } from './instances/instances.module';
import { ProxiesModule } from './proxies/proxies.module';
import { ProvidersModule } from './providers/providers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    PrismaModule, 
    CustomersModule, 
    AuthModule, 
    NotificationsModule,
    WhatsappModule,
    TicketsModule,
    UsersModule,
    InstancesModule,
    ProxiesModule,
    ProvidersModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}