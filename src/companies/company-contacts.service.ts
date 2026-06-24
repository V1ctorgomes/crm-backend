import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';

@Injectable()
export class CompanyContactsService {
  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
  ) {}

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
}
