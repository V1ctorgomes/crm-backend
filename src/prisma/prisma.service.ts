import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Inicia o PrismaClient e garante que o TS lê as tabelas (Contact, Message, etc.)
    super(); 
  }

  async onModuleInit() {
    await this.$connect();
  }
}