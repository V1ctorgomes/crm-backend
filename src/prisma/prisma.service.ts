import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma'; // Ajuste o caminho se necessário

@Injectable()
export class PrismaService extends PrismaClient {}