import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompanyInput,
  onlyDigits,
  sanitizeAndAssertCompany,
} from './companies.validation';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
  ) {}

  private mapCompany<T extends { id: string; legalName: string; tradeName: string | null; cnpj: string }>(c: T) {
    return c;
  }

  /** Lista as empresas (directório global do utilizador) com contagem de contactos ligados. */
  async list(userId: string, search?: string) {
    const term = String(search || '').trim();
    const where: Prisma.CompanyWhereInput = { userId };
    if (term) {
      const digits = onlyDigits(term);
      where.OR = [
        { legalName: { contains: term, mode: 'insensitive' } },
        { tradeName: { contains: term, mode: 'insensitive' } },
        ...(digits ? [{ cnpj: { contains: digits } }] : []),
      ];
    }
    const companies = await this.prisma.company.findMany({
      where,
      orderBy: { legalName: 'asc' },
      include: { _count: { select: { contactLinks: true, tickets: true } } },
    });
    return companies.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      tradeName: c.tradeName,
      cnpj: c.cnpj,
      contactCount: c._count.contactLinks,
      ticketCount: c._count.tickets,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /** Detalhe de uma empresa + contactos ligados. */
  async getOne(userId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, userId },
      include: {
        contactLinks: {
          include: { contact: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { tickets: true } },
      },
    });
    if (!company) {
      throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);
    }
    return {
      id: company.id,
      legalName: company.legalName,
      tradeName: company.tradeName,
      cnpj: company.cnpj,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      ticketCount: company._count.tickets,
      contacts: company.contactLinks.map((l) => ({
        number: l.contact.number,
        name: l.contact.name,
        email: l.contact.email,
        cnpj: l.contact.cnpj,
        profilePictureUrl: l.contact.profilePictureUrl,
        contactKind: l.contact.contactKind,
      })),
    };
  }

  async create(userId: string, data: CompanyInput) {
    const d = sanitizeAndAssertCompany(data);
    await this.assertNoDuplicate(userId, d.legalName, d.cnpj);
    try {
      return await this.prisma.company.create({
        data: { userId, legalName: d.legalName, tradeName: d.tradeName, cnpj: d.cnpj },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpException('Já existe uma empresa com este CNPJ.', HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async update(userId: string, id: string, data: CompanyInput) {
    const existing = await this.prisma.company.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);
    const d = sanitizeAndAssertCompany(data);
    if (d.legalName.toLowerCase() !== existing.legalName.toLowerCase() || d.cnpj !== existing.cnpj) {
      await this.assertNoDuplicate(userId, d.legalName, d.cnpj, id);
    }
    try {
      return await this.prisma.company.update({
        where: { id },
        data: { legalName: d.legalName, tradeName: d.tradeName, cnpj: d.cnpj },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpException('Já existe uma empresa com este CNPJ.', HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async remove(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    const existing = await this.prisma.company.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);
    const osCount = await this.prisma.ticket.count({
      where: { userId, companyId: id },
    });
    if (osCount > 0) {
      const osLabel = osCount === 1 ? '1 ordem de serviço vinculada' : `${osCount} ordens de serviço vinculadas`;
      throw new HttpException(
        `Não é possível eliminar esta empresa: existem ${osLabel}. Remova ou altere a empresa nessas OS antes de eliminar.`,
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.company.delete({ where: { id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.COMPANY,
        resourceId: id,
        rawReason,
        snapshot: existing,
      });
    });
    return { success: true };
  }

  /** Liga uma empresa existente a um contacto (idempotente). */
  async linkContact(userId: string, companyId: string, number: string) {
    const contactNumber = String(number || '').trim();
    if (!contactNumber) {
      throw new HttpException('Contacto inválido.', HttpStatus.BAD_REQUEST);
    }
    const [contact, company] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { number_userId: { number: contactNumber, userId } },
        select: { number: true },
      }),
      this.prisma.company.findFirst({ where: { id: companyId, userId }, select: { id: true } }),
    ]);
    if (!contact) throw new HttpException('Contacto não encontrado.', HttpStatus.NOT_FOUND);
    if (!company) throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);

    await this.prisma.contactCompany.upsert({
      where: {
        userId_contactNumber_companyId: { userId, contactNumber, companyId },
      },
      create: { userId, contactNumber, companyId },
      update: {},
    });
    return { success: true };
  }

  async unlinkContact(userId: string, companyId: string, number: string, actor: AuditActor, rawReason?: string) {
    const contactNumber = String(number || '').trim();
    const link = await this.prisma.contactCompany.findFirst({
      where: { userId, companyId, contactNumber },
      include: {
        company: { select: { id: true, legalName: true, cnpj: true } },
        contact: { select: { number: true, name: true } },
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.contactCompany.deleteMany({
        where: { userId, companyId, contactNumber },
      });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.CONTACT_COMPANY_LINK,
        resourceId: `${companyId}:${contactNumber}`,
        rawReason,
        snapshot: link || { userId, companyId, contactNumber },
      });
    });
    return { success: true };
  }

  /** Empresas ligadas a um contacto (para alimentar o select da OS). */
  async listForContact(userId: string, number: string) {
    const links = await this.prisma.contactCompany.findMany({
      where: { userId, contactNumber: number },
      include: { company: true },
      orderBy: { company: { legalName: 'asc' } },
    });
    return links.map((l) => ({
      id: l.company.id,
      legalName: l.company.legalName,
      tradeName: l.company.tradeName,
      cnpj: l.company.cnpj,
    }));
  }

  private async assertNoDuplicate(userId: string, legalName: string, cnpj: string, ignoreId?: string) {
    const where: Prisma.CompanyWhereInput = {
      userId,
      OR: [{ cnpj }, { legalName: { equals: legalName, mode: 'insensitive' } }],
    };
    if (ignoreId) where.id = { not: ignoreId };
    const dup = await this.prisma.company.findFirst({ where, select: { cnpj: true, legalName: true } });
    if (!dup) return;
    if (dup.cnpj === cnpj) {
      throw new HttpException('Já existe uma empresa com este CNPJ.', HttpStatus.CONFLICT);
    }
    throw new HttpException('Já existe uma empresa com esta Razão Social.', HttpStatus.CONFLICT);
  }
}
