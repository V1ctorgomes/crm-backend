import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Customer } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, userId } as any });
  }

  async findAll(userId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({ where: { userId } });
  }

  async findOne(userId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, userId } });
  }

  async update(userId: string, id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({ where: { id, userId } });
    return this.prisma.customer.update({ where: { id }, data });
  }

  async remove(userId: string, id: string): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({ where: { id, userId } });
    return this.prisma.customer.delete({ where: { id } });
  }
}