import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isTicketCatalogCategory, TICKET_CATALOG_CATEGORIES, TicketCatalogCategory } from './ticket-catalog.constants';

@Injectable()
export class TicketCatalogService {
  constructor(private prisma: PrismaService) {}

  /** Listas para selects (ADMIN, USER, DEVELOPER). */
  async getActiveOptionsGrouped(): Promise<Record<TicketCatalogCategory, string[]>> {
    const rows = await this.prisma.ticketCatalogItem.findMany({
      where: { isActive: true, category: { in: [...TICKET_CATALOG_CATEGORIES] } },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    const out: Record<TicketCatalogCategory, string[]> = {
      MARCA: [],
      MODELO: [],
      CUSTOMER_TYPE: [],
      TICKET_TYPE: [],
    };
    for (const r of rows) {
      if (isTicketCatalogCategory(r.category)) out[r.category].push(r.label);
    }
    return out;
  }

  async listAllForManage() {
    return this.prisma.ticketCatalogItem.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createItem(category: string, labelRaw: string) {
    if (!isTicketCatalogCategory(category)) {
      throw new HttpException('Categoria inválida.', HttpStatus.BAD_REQUEST);
    }
    const label = String(labelRaw || '').trim();
    if (label.length < 2) {
      throw new HttpException('O texto deve ter pelo menos 2 caracteres.', HttpStatus.BAD_REQUEST);
    }
    const dup = await this.prisma.ticketCatalogItem.findFirst({
      where: {
        category,
        label: { equals: label, mode: 'insensitive' },
      },
    });
    if (dup) {
      throw new HttpException('Já existe um item igual nesta categoria.', HttpStatus.CONFLICT);
    }
    const max = await this.prisma.ticketCatalogItem.aggregate({
      where: { category },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? 0) + 1;
    return this.prisma.ticketCatalogItem.create({
      data: { category, label, sortOrder },
    });
  }

  async updateItem(id: string, data: { label?: string; isActive?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.ticketCatalogItem.findUnique({ where: { id } });
    if (!existing) throw new HttpException('Item não encontrado.', HttpStatus.NOT_FOUND);
    const patch: { label?: string; isActive?: boolean; sortOrder?: number } = {};
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.label !== undefined) {
      const label = String(data.label).trim();
      if (label.length < 2) throw new HttpException('O texto deve ter pelo menos 2 caracteres.', HttpStatus.BAD_REQUEST);
      const dup = await this.prisma.ticketCatalogItem.findFirst({
        where: {
          category: existing.category,
          label: { equals: label, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (dup) throw new HttpException('Já existe um item igual nesta categoria.', HttpStatus.CONFLICT);
      patch.label = label;
    }
    return this.prisma.ticketCatalogItem.update({ where: { id }, data: patch });
  }

  async deleteItem(id: string) {
    try {
      return await this.prisma.ticketCatalogItem.delete({ where: { id } });
    } catch {
      throw new HttpException('Não foi possível eliminar o item.', HttpStatus.BAD_REQUEST);
    }
  }

  async assertActiveLabels(data: {
    marca: string;
    modelo: string;
    customerType: string;
    ticketType: string;
  }): Promise<void> {
    const checks: [TicketCatalogCategory, string][] = [
      ['MARCA', data.marca],
      ['MODELO', data.modelo],
      ['CUSTOMER_TYPE', data.customerType],
      ['TICKET_TYPE', data.ticketType],
    ];
    const rows = await this.prisma.ticketCatalogItem.findMany({
      where: {
        isActive: true,
        OR: checks.map(([category, label]) => ({ category, label })),
      },
      select: { category: true, label: true },
    });
    const foundLabels = new Set(rows.map((row) => `${row.category}:${row.label}`));

    for (const [category, label] of checks) {
      if (!foundLabels.has(`${category}:${label}`)) {
        const human =
          category === 'MARCA'
            ? 'Marca'
            : category === 'MODELO'
              ? 'Modelo'
              : category === 'CUSTOMER_TYPE'
                ? 'Tipo de cliente'
                : 'Tipo de solicitação';
        throw new HttpException(
          `O valor «${label}» não está cadastrado em «${human}» ou está inativo. Peça ao developer para atualizar o catálogo.`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }
}
