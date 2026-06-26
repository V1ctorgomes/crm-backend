import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptField, decryptField } from '../common/field-crypto';
import { maskSecret } from '../common/mask-secret';
import { sanitizeProxyInput } from './proxies.validation';

function toPublicProxy(row: {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  protocol: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    protocol: row.protocol,
    passwordSet: Boolean(row.password),
    password: maskSecret(row.password ? decryptField(row.password) : null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class ProxiesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Record<string, unknown>) {
    const input = sanitizeProxyInput(data);
    const row = await this.prisma.proxy.create({
      data: {
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password ? encryptField(input.password) : null,
        protocol: input.protocol,
      },
    });
    return toPublicProxy(row);
  }

  async findAll() {
    const rows = await this.prisma.proxy.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toPublicProxy);
  }

  remove(id: string) {
    return this.prisma.proxy.delete({ where: { id } });
  }
}
