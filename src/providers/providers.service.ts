import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async getProvider(name: string) {
    const provider = await this.prisma.provider.findUnique({ where: { name } });
    return provider || {};
  }

  async upsertProvider(name: string, data: any) {
    const existing = await this.prisma.provider.findUnique({ where: { name } });
    
    if (existing) {
      return this.prisma.provider.update({
        where: { name },
        data: {
          baseUrl: data.baseUrl,
          apiKey: data.apiKey,
          apiToken: data.apiToken,
          bucket: data.bucket,
          region: data.region,
          accountId: data.accountId,
        },
      });
    }

    return this.prisma.provider.create({
      data: {
        name,
        baseUrl: data.baseUrl,
        apiKey: data.apiKey,
        apiToken: data.apiToken,
        bucket: data.bucket,
        region: data.region,
        accountId: data.accountId,
      },
    });
  }
}