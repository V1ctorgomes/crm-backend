import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappInstanceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultInstanceName(_userId?: string): Promise<string> {
    const inst = await this.prisma.instance.findFirst({
      where: { status: 'connected' },
      orderBy: { createdAt: 'desc' },
    });
    if (!inst) throw new HttpException('Sem instância conectada.', HttpStatus.BAD_REQUEST);
    return inst.name;
  }

  async getUserIdFromInstance(instanceName: string): Promise<string | null> {
    const instance = await this.prisma.instance.findUnique({
      where: { name: instanceName },
      select: { userId: true },
    });
    return instance?.userId || null;
  }

  async getInboundMessageUserIds(instanceName: string): Promise<string[]> {
    const instance = await this.prisma.instance.findUnique({
      where: { name: instanceName },
      select: { userId: true },
    });
    if (!instance) return [];
    const team = await this.prisma.user.findMany({
      where: { approved: true, role: { in: ['ADMIN', 'USER'] } },
      select: { id: true },
    });
    return [...new Set([instance.userId, ...team.map((u) => u.id)])];
  }

  async assertInstanceExists(instanceName: string): Promise<void> {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName } });
  }
}
