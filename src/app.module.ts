// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { WhatsappModule } from './whatsapp/whatsapp.module'; // <-- Nova importação

@Module({
  imports: [
    PrismaModule, 
    CustomersModule, 
    AuthModule, // Esta linha é a que faz a rota /auth aparecer no log
    WhatsappModule // <-- Registando o módulo do WhatsApp na aplicação
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}