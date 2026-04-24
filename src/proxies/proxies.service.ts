import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProxiesService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.proxy.create({
      data: {
        name: data.name,
        host: data.host,
        port: Number(data.port),
        username: data.username || null,
        password: data.password || null,
        protocol: data.protocol || 'http',
      },
    });
  }

  findAll() {
    return this.prisma.proxy.findMany({ orderBy: { createdAt: 'desc' } });
  }

  remove(id: string) {
    return this.prisma.proxy.delete({ where: { id } });
  }
}