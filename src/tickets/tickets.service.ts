import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.stage.count();
    if (count === 0) {
      await this.prisma.stage.create({ data: { name: 'Novo', order: 1, color: '#bfdbfe' } });
      await this.prisma.stage.create({ data: { name: 'Em Análise', order: 2, color: '#fef08a' } });
      await this.prisma.stage.create({ data: { name: 'Concluído', order: 3, color: '#bbf7d0' } });
    }
  }

  // Traz apenas as fases ativas e os tickets NÃO arquivados
  async getBoard() {
    return this.prisma.stage.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        tickets: {
          where: { isArchived: false },
          include: { contact: true, notes: { orderBy: { createdAt: 'desc' } } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  async getAllStages() {
    return this.prisma.stage.findMany({ orderBy: { order: 'asc' } });
  }

  async getArchivedTickets() {
    return this.prisma.ticket.findMany({
      where: { isArchived: true },
      include: { contact: true, stage: true, notes: { orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async createStage(name: string, color: string) {
    const count = await this.prisma.stage.count();
    return this.prisma.stage.create({
      data: { name, color: color || '#e2e8f0', order: count + 1 }
    });
  }

  async updateStage(id: string, data: { name?: string; color?: string; isActive?: boolean }) {
    return this.prisma.stage.update({ where: { id }, data });
  }

  async reorderStages(stages: { id: string; order: number }[]) {
    const updates = stages.map(s => 
      this.prisma.stage.update({ where: { id: s.id }, data: { order: s.order } })
    );
    return this.prisma.$transaction(updates);
  }

  async createTicket(data: { contactNumber: string, nome: string, email: string, cpf: string, marca: string, modelo: string, stageId: string }) {
    await this.prisma.contact.update({
      where: { number: data.contactNumber },
      data: { name: data.nome, email: data.email, cnpj: data.cpf }
    });

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
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { stageId } });
  }

  async toggleArchiveTicket(ticketId: string, isArchived: boolean) {
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { isArchived } });
  }

  async addNote(ticketId: string, text: string) {
    return this.prisma.note.create({ data: { ticketId, text } });
  }
}