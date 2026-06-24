import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketQueryService {
  constructor(private prisma: PrismaService) {}

  async getTicketByContact(userId: string, contactNumber: string) {
    return this.prisma.ticket.findFirst({
      where: { userId, contactNumber, isArchived: false },
      include: {
        contact: true,
        company: true,
        stage: true,
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
        files: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getArchivedTickets(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId, isArchived: true },
      include: {
        contact: true,
        company: true,
        stage: true,
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
        files: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
