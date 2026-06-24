import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketAccessService {
  constructor(private prisma: PrismaService) {}

  async ensureDefaultStages(userId: string) {
    const count = await this.prisma.stage.count({ where: { userId } });
    if (count > 0) return;

    await this.prisma.stage.createMany({
      data: [
        { userId, name: 'Novo', order: 1, color: '#bfdbfe' },
        { userId, name: 'Em Análise', order: 2, color: '#fef08a' },
        { userId, name: 'Concluído', order: 3, color: '#bbf7d0' },
      ],
    });
  }

  async ensureTicketOwner(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true },
    });
    if (!ticket) {
      throw new HttpException('Solicitação não encontrada.', HttpStatus.NOT_FOUND);
    }
  }

  async ensureStageOwner(userId: string, stageId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, userId },
      select: { id: true },
    });
    if (!stage) {
      throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
    }
  }
}
