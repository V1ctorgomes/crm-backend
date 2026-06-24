import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAndAssertCreateTicket } from './ticket-create.validation';
import { TicketCatalogService } from '../ticket-catalog/ticket-catalog.service';
import { TicketAccessService } from './ticket-access.service';
import { TicketCompanyResolverService } from './ticket-company-resolver.service';

@Injectable()
export class TicketCreateService {
  constructor(
    private prisma: PrismaService,
    private ticketCatalog: TicketCatalogService,
    private ticketAccess: TicketAccessService,
    private ticketCompanyResolver: TicketCompanyResolverService,
  ) {}

  async createTicket(
    userId: string,
    data: {
      contactNumber: string;
      nome: string;
      email: string;
      cpf: string;
      marca: string;
      modelo: string;
      customerType?: string;
      ticketType?: string;
      stageId: string;
      companyId?: string | null;
    },
  ) {
    const d = sanitizeAndAssertCreateTicket(data);
    await Promise.all([
      this.ticketCatalog.assertActiveLabels({
        marca: d.marca,
        modelo: d.modelo,
        customerType: d.customerType,
        ticketType: d.ticketType,
      }),
      this.ticketAccess.ensureStageOwner(userId, d.stageId),
    ]);

    const resolvedCompanyId = await this.ticketCompanyResolver.resolveCompanyForTicket(
      userId,
      d.contactNumber,
      d.companyId,
    );

    const contactUpdate = resolvedCompanyId
      ? { email: d.email, cnpj: d.cpf }
      : { name: d.nome, email: d.email, cnpj: d.cpf };

    await this.prisma.contact.upsert({
      where: { number_userId: { number: d.contactNumber, userId } },
      update: contactUpdate,
      create: {
        number: d.contactNumber,
        userId,
        name: resolvedCompanyId ? d.contactNumber : d.nome,
        email: d.email,
        cnpj: resolvedCompanyId ? null : d.cpf,
      },
    });
    return this.prisma.ticket.create({
      data: {
        userId,
        contactNumber: d.contactNumber,
        stageId: d.stageId,
        marca: d.marca,
        modelo: d.modelo,
        customerType: d.customerType,
        ticketType: d.ticketType,
        companyId: resolvedCompanyId,
      },
      include: { contact: true, company: true, notes: true, files: true, tasks: true },
    });
  }
}
