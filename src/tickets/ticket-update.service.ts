import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { sanitizeAndAssertUpdateTicket } from './ticket-create.validation';
import { assertResolutionReasonWhenArchiving } from './ticket-resolution.validation';
import { TicketCatalogService } from '../ticket-catalog/ticket-catalog.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { TicketAccessService } from './ticket-access.service';

@Injectable()
export class TicketUpdateService {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
    private ticketCatalog: TicketCatalogService,
    private deletionAudit: DeletionAuditService,
    private ticketAccess: TicketAccessService,
  ) {}

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
      this.ticketAccess.ensureTicketOwner(userId, ticketId),
      this.ticketAccess.ensureStageOwner(userId, stageId),
    ]);
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { stageId } });
  }

  async toggleArchiveTicket(
    userId: string,
    ticketId: string,
    isArchived: boolean,
    resolution?: string,
    resolutionReason?: string,
  ) {
    await this.ticketAccess.ensureTicketOwner(userId, ticketId);
    const sanitizedReason = assertResolutionReasonWhenArchiving(isArchived, resolution, resolutionReason);
    const dataToUpdate: Prisma.TicketUpdateInput = { isArchived };

    if (isArchived) {
      const res = String(resolution ?? '')
        .trim()
        .toUpperCase();
      dataToUpdate.resolution = res;
      dataToUpdate.resolutionReason = sanitizedReason ?? null;
    } else {
      dataToUpdate.resolution = null;
      dataToUpdate.resolutionReason = null;
    }

    return this.prisma.ticket.update({ where: { id: ticketId }, data: dataToUpdate });
  }

  async deleteTicket(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    const full = await this.prisma.ticket.findFirst({
      where: { id, userId },
      include: {
        contact: { select: { number: true, name: true } },
        company: { select: { id: true, legalName: true, cnpj: true } },
        stage: { select: { id: true, name: true } },
        notes: true,
        tasks: true,
        files: true,
      },
    });
    if (!full) {
      throw new HttpException('Solicitação não encontrada.', HttpStatus.NOT_FOUND);
    }
    await this.r2Service.deleteFolder(this.r2Service.solicitacoesTicketPath(userId, id));
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.delete({ where: { id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.TICKET,
        resourceId: id,
        rawReason,
        snapshot: full,
      });
    });
    return { success: true };
  }
}
