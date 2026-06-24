import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAccessService } from './ticket-access.service';

@Injectable()
export class TicketBoardService {
  constructor(
    private prisma: PrismaService,
    private ticketAccess: TicketAccessService,
  ) {}

  async getBoard(userId: string) {
    await this.ticketAccess.ensureDefaultStages(userId);
    return this.prisma.stage.findMany({
      where: { userId, isActive: true },
      orderBy: { order: 'asc' },
      include: {
        tickets: {
          where: { userId, isArchived: false },
          include: {
            contact: true,
            company: true,
            notes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { dueDate: 'asc' } },
            files: { orderBy: { createdAt: 'desc' } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  /**
   * Estrutura hierárquica para a página de Arquivos: Empresa → Contato → OS.
   * Tickets sem empresa vinculada ficam num bucket especial (`company: null`) para que
   * o histórico continue acessível e o utilizador consiga corrigir o vínculo depois.
   */
  async getFolders(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { userId },
      include: {
        contact: true,
        company: true,
        files: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const companies = new Map<
      string,
      {
        company: { id: string; legalName: string; tradeName: string | null; cnpj: string } | null;
        contacts: Map<string, { contact: any; tickets: any[] }>;
      }
    >();

    for (const t of tickets) {
      const companyKey = t.company?.id || '__no_company__';
      if (!companies.has(companyKey)) {
        companies.set(companyKey, {
          company: t.company
            ? {
                id: t.company.id,
                legalName: t.company.legalName,
                tradeName: t.company.tradeName,
                cnpj: t.company.cnpj,
              }
            : null,
          contacts: new Map(),
        });
      }
      const bucket = companies.get(companyKey)!;
      if (!bucket.contacts.has(t.contactNumber)) {
        bucket.contacts.set(t.contactNumber, { contact: t.contact, tickets: [] });
      }
      bucket.contacts.get(t.contactNumber)!.tickets.push(t);
    }

    return Array.from(companies.values()).map((c) => ({
      company: c.company,
      contacts: Array.from(c.contacts.values()),
    }));
  }
}
