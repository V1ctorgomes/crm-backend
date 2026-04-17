import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  // Cria fases padrão caso seja a primeira vez que roda o sistema
  async onModuleInit() {
    const count = await this.prisma.stage.count();
    if (count === 0) {
      await this.prisma.stage.create({ data: { name: 'Novo', order: 1 } });
      await this.prisma.stage.create({ data: { name: 'Em Análise', order: 2 } });
      await this.prisma.stage.create({ data: { name: 'Concluído', order: 3 } });
    }
  }

  async getBoard() {
    return this.prisma.stage.findMany({
      orderBy: { order: 'asc' },
      include: {
        tickets: {
          include: {
            contact: true,
            notes: { orderBy: { createdAt: 'desc' } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  async createStage(name: string) {
    const count = await this.prisma.stage.count();
    return this.prisma.stage.create({
      data: { name, order: count + 1 }
    });
  }

  async createTicket(data: { contactNumber: string, nome: string, email: string, cpf: string, marca: string, modelo: string, stageId: string }) {
    // 1. Atualiza os dados do contato primeiro (garante que o Nome/Email/CPF ficam salvos)
    await this.prisma.contact.update({
      where: { number: data.contactNumber },
      data: { name: data.nome, email: data.email, cnpj: data.cpf }
    });

    // 2. Cria a solicitação
    return this.prisma.ticket.create({
      data: {
        contactNumber: data.contactNumber,
        stageId: data.stageId,
        marca: data.marca,
        modelo: data.modelo
      },
      include: { contact: true, notes: true }
    });
  }

  async updateTicketStage(ticketId: string, stageId: string) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { stageId }
    });
  }

  async addNote(ticketId: string, text: string) {
    return this.prisma.note.create({
      data: { ticketId, text }
    });
  }
}