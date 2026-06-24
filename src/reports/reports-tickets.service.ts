import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { FunnelStage } from './reports.types';
import { mapByUser } from './reports.helpers';

@Injectable()
export class ReportsTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchTicketAggregates(from: Date, to: Date) {
    const [createdGroup, closedGroup, cancelledGroup] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['userId'],
        where: {
          isArchived: true,
          updatedAt: { gte: from, lte: to },
          NOT: { resolution: 'CANCELLED' },
        },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['userId'],
        where: {
          isArchived: true,
          updatedAt: { gte: from, lte: to },
          resolution: 'CANCELLED',
        },
        _count: { _all: true },
      }),
    ]);

    return {
      createdMap: mapByUser(createdGroup),
      closedMap: mapByUser(closedGroup),
      cancelledMap: mapByUser(cancelledGroup),
    };
  }

  async fetchFunnel(): Promise<FunnelStage[]> {
    const stages = await this.prisma.stage.findMany({
      where: { isActive: true },
      select: { name: true, color: true, tickets: { where: { isArchived: false }, select: { id: true } } },
    });
    const funnelMap = new Map<string, FunnelStage>();
    for (const s of stages) {
      const key = s.name.trim();
      const cur = funnelMap.get(key);
      if (cur) {
        cur.count += s.tickets.length;
      } else {
        funnelMap.set(key, { name: key, color: s.color, count: s.tickets.length });
      }
    }
    return Array.from(funnelMap.values()).sort((a, b) => b.count - a.count);
  }

  async fetchDailyTickets(from: Date, to: Date) {
    const [createdTickets, archivedInPeriod] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { isArchived: true, updatedAt: { gte: from, lte: to } },
        select: { updatedAt: true, resolution: true },
      }),
    ]);
    return { createdTickets, archivedInPeriod };
  }
}
