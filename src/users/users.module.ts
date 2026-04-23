import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { R2Service } from '../whatsapp/r2.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, R2Service], // Adicionado o R2Service aqui
  exports: [UsersService],
})
export class UsersModule {}