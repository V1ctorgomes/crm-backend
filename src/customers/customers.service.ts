import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Customer } from '@prisma/client';
import { sanitizeCustomerInput } from './customers.validation';
import { assertUuidParam } from '../common/uuid-param';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: Record<string, unknown>): Promise<Customer> {
    const input = sanitizeCustomerInput(data);
    return this.prisma.customer.create({
      data: { ...input, userId },
    });
  }

  async findAll(userId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({ where: { userId } });
  }

  async findOne(userId: string, id: string): Promise<Customer | null> {
    const safeId = assertUuidParam(id);
    return this.prisma.customer.findFirst({ where: { id: safeId, userId } });
  }

  async update(userId: string, id: string, data: Record<string, unknown>): Promise<Customer> {
    const safeId = assertUuidParam(id);
    const input = sanitizeCustomerInput(data);
    await this.prisma.customer.findFirstOrThrow({ where: { id: safeId, userId } });
    return this.prisma.customer.update({ where: { id: safeId }, data: input });
  }

  async remove(userId: string, id: string): Promise<Customer> {
    const safeId = assertUuidParam(id);
    await this.prisma.customer.findFirstOrThrow({ where: { id: safeId, userId } });
    return this.prisma.customer.delete({ where: { id: safeId } });
  }
}