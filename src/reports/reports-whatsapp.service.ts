import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapByUser } from './reports.helpers';

@Injectable()
export class ReportsWhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchMessageAggregates(from: Date, to: Date) {
    const [sentGroup, receivedGroup, lastMsgInPeriod] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['userId'],
        where: { type: 'sent', timestamp: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['userId'],
        where: { type: 'received', timestamp: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: from, lte: to } },
        _max: { timestamp: true },
      }),
    ]);

    return {
      sentMap: mapByUser(sentGroup),
      receivedMap: mapByUser(receivedGroup),
      lastMsgInPeriod,
    };
  }

  async fetchDailyMessages(from: Date, to: Date) {
    const [sentMsgs, receivedMsgs] = await Promise.all([
      this.prisma.message.findMany({
        where: { type: 'sent', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.message.findMany({
        where: { type: 'received', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
    ]);
    return { sentMsgs, receivedMsgs };
  }
}
