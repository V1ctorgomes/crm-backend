import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompanyInput,
  onlyDigits,
  sanitizeAndAssertCompany,
} from './companies.validation';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

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
      include: { _count: { select: { contactLinks: true } } },
    });
    return companies.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      tradeName: c.tradeName,
      cnpj: c.cnpj,
      contactCount: c._count.contactLinks,
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
      contacts: company.contactLinks.map((l) => ({
        number: l.contact.number,
        name: l.contact.name,
        email: l.contact.email,
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

  async remove(userId: string, id: string) {
    const existing = await this.prisma.company.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);
    await this.prisma.company.delete({ where: { id } });
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

  async unlinkContact(userId: string, companyId: string, number: string) {
    const contactNumber = String(number || '').trim();
    await this.prisma.contactCompany.deleteMany({
      where: { userId, companyId, contactNumber },
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
