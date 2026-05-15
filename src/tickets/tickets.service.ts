import { Injectable, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';
import { sanitizeAndAssertCreateTicket, sanitizeAndAssertUpdateTicket } from './ticket-create.validation';
import { TicketCatalogService } from '../ticket-catalog/ticket-catalog.service';

@Injectable()
export class TicketsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private ticketCatalog: TicketCatalogService,
  ) {}

  async onModuleInit() {
    // Stages padrão agora são por usuário e são criadas sob demanda.
  }

  private async ensureDefaultStages(userId: string) {
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

  private async ensureTicketOwner(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true },
    });
    if (!ticket) {
      throw new HttpException('Solicitação não encontrada.', HttpStatus.NOT_FOUND);
    }
  }

  private async ensureStageOwner(userId: string, stageId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, userId },
      select: { id: true },
    });
    if (!stage) {
      throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
    }
  }

  async getBoard(userId: string) {
    await this.ensureDefaultStages(userId);
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

  async uploadTicketFile(userId: string, ticketId: string, file: any, description?: string) {
    if (!file) throw new HttpException('Arquivo ausente', HttpStatus.BAD_REQUEST);
    await this.ensureTicketOwner(userId, ticketId);
    
    const folder = this.r2Service.solicitacoesTicketPath(userId, ticketId);
    const fileUrl = await this.r2Service.uploadFile(file, folder);
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

  async deleteTicketFile(userId: string, fileId: string) {
    const file = await this.prisma.ticketFile.findFirst({
      where: { id: fileId, ticket: { userId } },
    });
    if (file) {
       await this.r2Service.deleteFile(file.fileUrl);
       await this.prisma.ticketFile.delete({ where: { id: fileId } });
    }
    return { success: true };
  }

  async deleteTicket(userId: string, id: string) {
    await this.ensureTicketOwner(userId, id);
    await this.r2Service.deleteFolder(this.r2Service.solicitacoesTicketPath(userId, id));
    return this.prisma.ticket.delete({ where: { id } });
  }

  async getTicketByContact(userId: string, contactNumber: string) {
    return this.prisma.ticket.findFirst({
      where: { userId, contactNumber, isArchived: false },
      include: {
        contact: true,
        company: true,
        stage: true,
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
        files: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAllStages(userId: string) {
    await this.ensureDefaultStages(userId);
    return this.prisma.stage.findMany({ where: { userId }, orderBy: { order: 'asc' } });
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
        files: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async createStage(userId: string, name: string, color: string) {
    const count = await this.prisma.stage.count({ where: { userId } });
    return this.prisma.stage.create({ data: { userId, name, color: color || '#e2e8f0', order: count + 1 } });
  }

  async updateStage(userId: string, id: string, data: { name?: string; color?: string; isActive?: boolean }) {
    await this.ensureStageOwner(userId, id);
    return this.prisma.stage.update({ where: { id }, data });
  }

  async deleteStage(userId: string, id: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!stage) {
      throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
    }

    const activeOnStage = await this.prisma.ticket.count({
      where: { userId, stageId: id, isArchived: false },
    });
    if (activeOnStage > 0) {
      throw new HttpException(
        'Não é possível apagar uma fase que ainda contém solicitações ativas. Mova ou arquive todas as OS desta fase antes de apagar.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const linked = await tx.ticket.count({ where: { userId, stageId: id } });
        if (linked > 0) {
          const fallback = await tx.stage.findFirst({
            where: { userId, id: { not: id } },
            orderBy: { order: 'asc' },
            select: { id: true },
          });
          if (!fallback) {
            throw new HttpException(
              'Não é possível apagar esta fase: ainda há solicitações arquivadas nela e não existe outra fase para reatribuí-las. Crie outra fase ou altere a fase dessas OS nos arquivados.',
              HttpStatus.BAD_REQUEST,
            );
          }
          await tx.ticket.updateMany({
            where: { userId, stageId: id },
            data: { stageId: fallback.id },
          });
        }
        return tx.stage.delete({ where: { id } });
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          throw new HttpException(
            'Não é possível apagar esta fase: ainda existem solicitações ou dados ligados a ela. Mova as OS para outra fase e tente novamente.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (e.code === 'P2025') {
          throw new HttpException('Fase não encontrada.', HttpStatus.NOT_FOUND);
        }
      }
      throw e;
    }
  }

  async reorderStages(userId: string, stages: { id: string; order: number }[]) {
    const ids = stages.map((s) => s.id);
    const owned = await this.prisma.stage.count({ where: { userId, id: { in: ids } } });
    if (owned !== ids.length) {
      throw new HttpException('Fases inválidas.', HttpStatus.BAD_REQUEST);
    }
    const updates = stages.map(s => this.prisma.stage.update({ where: { id: s.id }, data: { order: s.order } }));
    return this.prisma.$transaction(updates);
  }

  async createTicket(userId: string, data: { contactNumber: string, nome: string, email: string, cpf: string, marca: string, modelo: string, customerType?: string, ticketType?: string, stageId: string, companyId?: string | null }) {
    const d = sanitizeAndAssertCreateTicket(data);
    await Promise.all([
      this.ticketCatalog.assertActiveLabels({
        marca: d.marca,
        modelo: d.modelo,
        customerType: d.customerType,
        ticketType: d.ticketType,
      }),
      this.ensureStageOwner(userId, d.stageId),
    ]);

    const resolvedCompanyId = await this.resolveCompanyForTicket(userId, d.contactNumber, d.companyId);

    // Com empresa na OS, «nome/cpf» do formulário são da empresa (cliente) — não sobrescrever o perfil do solicitante.
    const contactUpdate = resolvedCompanyId
      ? { email: d.email }
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

  /**
   * Regras de companyId na criação de OS:
   * - 0 empresas ligadas ao contacto: companyId tem de vir vazio.
   * - 1 empresa ligada: usa-se essa (mesmo que body não a indique); se body indicar, tem de coincidir.
   * - >1 empresas ligadas: body **tem** de indicar companyId e ele tem de estar ligado ao contacto.
   */
  private async resolveCompanyForTicket(userId: string, contactNumber: string, requestedId: string | null): Promise<string | null> {
    const links = await this.prisma.contactCompany.findMany({
      where: { userId, contactNumber },
      select: { companyId: true },
    });
    const linkedIds = links.map((l) => l.companyId);

    if (linkedIds.length === 0) {
      if (requestedId) {
        throw new HttpException(
          'Este contacto ainda não tem empresas associadas. Associe uma empresa em Contatos antes de criar a OS.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return null;
    }

    if (linkedIds.length === 1) {
      const only = linkedIds[0];
      if (requestedId && requestedId !== only) {
        throw new HttpException('A empresa indicada não está ligada a este contacto.', HttpStatus.BAD_REQUEST);
      }
      return only;
    }

    if (!requestedId) {
      throw new HttpException(
        'Este contacto tem várias empresas associadas. Seleccione qual é a solicitante desta OS.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!linkedIds.includes(requestedId)) {
      throw new HttpException('A empresa indicada não está ligada a este contacto.', HttpStatus.BAD_REQUEST);
    }
    return requestedId;
  }

  async updateTicketDetails(
    userId: string,
    ticketId: string,
    raw: {
      nome?: string;
      email?: string;
      cpf?: string;
      marca?: string;
      modelo?: string;
      customerType?: string;
      ticketType?: string;
      companyId?: string | null;
    },
  ) {
    const existing = await this.prisma.ticket.findFirst({
      where: { id: ticketId, userId },
      select: { contactNumber: true, isArchived: true },
    });
    if (!existing) {
      throw new HttpException('Solicitação não encontrada.', HttpStatus.NOT_FOUND);
    }
    if (existing.isArchived) {
      throw new HttpException('Não é possível editar uma solicitação encerrada.', HttpStatus.BAD_REQUEST);
    }

    const d = sanitizeAndAssertUpdateTicket(raw);
    await this.ticketCatalog.assertActiveLabels({
      marca: d.marca,
      modelo: d.modelo,
      customerType: d.customerType,
      ticketType: d.ticketType,
    });

    let companyUpdate: { companyId: string | null } | null = null;
    if (d.companyId !== undefined) {
      if (d.companyId === null) {
        companyUpdate = { companyId: null };
      } else {
        const link = await this.prisma.contactCompany.findFirst({
          where: { userId, contactNumber: existing.contactNumber, companyId: d.companyId },
          select: { companyId: true },
        });
        if (!link) {
          throw new HttpException(
            'A empresa indicada não está vinculada a este contato.',
            HttpStatus.BAD_REQUEST,
          );
        }
        companyUpdate = { companyId: d.companyId };
      }
    }

    await this.prisma.contact.upsert({
      where: { number_userId: { number: existing.contactNumber, userId } },
      update: { name: d.nome, email: d.email, cnpj: d.cpf },
      create: {
        number: existing.contactNumber,
        userId,
        name: d.nome,
        email: d.email,
        cnpj: d.cpf,
      },
    });

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        marca: d.marca,
        modelo: d.modelo,
        customerType: d.customerType,
        ticketType: d.ticketType,
        ...(companyUpdate || {}),
      },
      include: { contact: true, company: true, notes: true, files: true, tasks: true },
    });
  }

  async updateTicketStage(userId: string, ticketId: string, stageId: string) {
    await Promise.all([
      this.ensureTicketOwner(userId, ticketId),
      this.ensureStageOwner(userId, stageId),
    ]);
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { stageId } });
  }

  async toggleArchiveTicket(userId: string, ticketId: string, isArchived: boolean, resolution?: string, resolutionReason?: string) {
    await this.ensureTicketOwner(userId, ticketId);
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

  async addNote(userId: string, ticketId: string, text: string) {
    await this.ensureTicketOwner(userId, ticketId);
    return this.prisma.note.create({ data: { ticketId, text } });
  }

  async deleteNote(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, ticket: { userId } } });
    if (!note) throw new HttpException('Nota não encontrada.', HttpStatus.NOT_FOUND);
    return this.prisma.note.delete({ where: { id } });
  }

  async addTask(userId: string, ticketId: string, title: string, dueDate: string) {
    await this.ensureTicketOwner(userId, ticketId);
    return this.prisma.task.create({
      data: {
        ticketId,
        title,
        dueDate: new Date(dueDate)
      }
    });
  }

  async toggleTask(userId: string, id: string, isCompleted: boolean) {
    const task = await this.prisma.task.findFirst({ where: { id, ticket: { userId } } });
    if (!task) throw new HttpException('Tarefa não encontrada.', HttpStatus.NOT_FOUND);
    return this.prisma.task.update({ where: { id }, data: { isCompleted } });
  }

  async deleteTask(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, ticket: { userId } } });
    if (!task) throw new HttpException('Tarefa não encontrada.', HttpStatus.NOT_FOUND);
    return this.prisma.task.delete({ where: { id } });
  }
}