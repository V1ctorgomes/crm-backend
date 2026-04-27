import { Injectable, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';

@Injectable()
export class TicketsService implements OnModuleInit {
  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  async onModuleInit() {
    const count = await this.prisma.stage.count();
    if (count === 0) {
      await this.prisma.stage.create({ data: { name: 'Novo', order: 1, color: '#bfdbfe' } });
      await this.prisma.stage.create({ data: { name: 'Em Análise', order: 2, color: '#fef08a' } });
      await this.prisma.stage.create({ data: { name: 'Concluído', order: 3, color: '#bbf7d0' } });
    }
  }

  async getBoard() {
    return this.prisma.stage.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        tickets: {
          where: { isArchived: false },
          include: { 
            contact: true, 
            notes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { dueDate: 'asc' } }, 
            files: { orderBy: { createdAt: 'desc' } } 
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  async getFolders() {
    const tickets = await this.prisma.ticket.findMany({
      include: {
        contact: true,
        files: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const map = new Map();
    for (const t of tickets) {
      if (!map.has(t.contactNumber)) {
        map.set(t.contactNumber, {
          contact: t.contact,
          tickets: []
        });
      }
      map.get(t.contactNumber).tickets.push(t);
    }
    return Array.from(map.values());
  }

  async uploadTicketFile(ticketId: string, file: any, description?: string) {
    if (!file) throw new HttpException('Arquivo ausente', HttpStatus.BAD_REQUEST);
    
    const fileUrl = await this.r2Service.uploadFile(file, `tickets/${ticketId}`);
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    return this.prisma.ticketFile.create({
      data: {
        ticketId,
        fileName: safeName,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
        description: description || null
      }
    });
  }

  async deleteTicketFile(fileId: string) {
    const file = await this.prisma.ticketFile.findUnique({ where: { id: fileId } });
    if (file) {
       await this.r2Service.deleteFile(file.fileUrl);
       await this.prisma.ticketFile.delete({ where: { id: fileId } });
    }
    return { success: true };
  }

  async deleteTicket(id: string) {
    await this.r2Service.deleteFolder(`tickets/${id}`);
    return this.prisma.ticket.delete({ where: { id } });
  }

  async getTicketByContact(contactNumber: string) {
    return this.prisma.ticket.findFirst({
      where: { contactNumber, isArchived: false },
      include: { 
        contact: true, 
        stage: true, 
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
        files: { orderBy: { createdAt: 'desc' } } 
      },
      orderBy: { createdAt: 'desc' } 
    });
  }

  async getAllStages() {
    return this.prisma.stage.findMany({ orderBy: { order: 'asc' } });
  }

  async getArchivedTickets() {
    return this.prisma.ticket.findMany({
      where: { isArchived: true },
      include: { 
        contact: true, 
        stage: true, 
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
        files: { orderBy: { createdAt: 'desc' } } 
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async createStage(name: string, color: string) {
    const count = await this.prisma.stage.count();
    return this.prisma.stage.create({ data: { name, color: color || '#e2e8f0', order: count + 1 } });
  }

  async updateStage(id: string, data: { name?: string; color?: string; isActive?: boolean }) {
    return this.prisma.stage.update({ where: { id }, data });
  }

  async deleteStage(id: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id }, include: { _count: { select: { tickets: true } } }
    });
    if (stage && stage._count.tickets > 0) {
      throw new HttpException('Não é possível apagar uma fase que contém solicitações.', HttpStatus.BAD_REQUEST);
    }
    return this.prisma.stage.delete({ where: { id } });
  }

  async reorderStages(stages: { id: string; order: number }[]) {
    const updates = stages.map(s => this.prisma.stage.update({ where: { id: s.id }, data: { order: s.order } }));
    return this.prisma.$transaction(updates);
  }

  // ATUALIZADO AQUI COM TICKET TYPE
  async createTicket(data: { contactNumber: string, nome: string, email: string, cpf: string, marca: string, modelo: string, customerType?: string, ticketType?: string, stageId: string }) {
    await this.prisma.contact.update({
      where: { number: data.contactNumber },
      data: { name: data.nome, email: data.email, cnpj: data.cpf }
    });
    return this.prisma.ticket.create({
      data: { 
        contactNumber: data.contactNumber, 
        stageId: data.stageId, 
        marca: data.marca, 
        modelo: data.modelo,
        customerType: data.customerType,
        ticketType: data.ticketType
      },
      include: { contact: true, notes: true, files: true, tasks: true }
    });
  }

  async updateTicketStage(ticketId: string, stageId: string) {
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { stageId } });
  }

  async toggleArchiveTicket(ticketId: string, isArchived: boolean, resolution?: string, resolutionReason?: string) {
    const dataToUpdate: any = { isArchived };

    if (isArchived) {
      if (resolution) dataToUpdate.resolution = resolution;
      if (resolutionReason !== undefined) dataToUpdate.resolutionReason = resolutionReason;
    } else {
      dataToUpdate.resolution = null;
      dataToUpdate.resolutionReason = null;
    }

    return this.prisma.ticket.update({ where: { id: ticketId }, data: dataToUpdate });
  }

  async addNote(ticketId: string, text: string) {
    return this.prisma.note.create({ data: { ticketId, text } });
  }

  async deleteNote(id: string) {
    return this.prisma.note.delete({ where: { id } });
  }

  async addTask(ticketId: string, title: string, dueDate: string) {
    return this.prisma.task.create({
      data: {
        ticketId,
        title,
        dueDate: new Date(dueDate)
      }
    });
  }

  async toggleTask(id: string, isCompleted: boolean) {
    return this.prisma.task.update({ where: { id }, data: { isCompleted } });
  }

  async deleteTask(id: string) {
    return this.prisma.task.delete({ where: { id } });
  }
}