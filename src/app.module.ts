import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule, 
    CustomersModule, 
    AuthModule // Esta linha é a que faz a rota /auth aparecer no log
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}