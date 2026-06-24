import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PerUserStats, TeamOverviewResponse } from './reports.types';
import { buildDailySeries, mergeTicketActivityMax, resolvePeriod } from './reports.helpers';
import { ReportsWhatsappService } from './reports-whatsapp.service';
import { ReportsTicketsService } from './reports-tickets.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappReports: ReportsWhatsappService,
    private readonly ticketsReports: ReportsTicketsService,
  ) {}

  /** Visão geral da equipe para ADMIN/DEVELOPER: WhatsApp e fluxo de OS no período. */
  async getTeamOverview(actorRole: string, fromIso?: string, toIso?: string): Promise<TeamOverviewResponse> {
    if (actorRole !== 'ADMIN' && actorRole !== 'DEVELOPER') {
      throw new ForbiddenException('Apenas administradores podem ver esta página.');
    }

    const { from, to } = resolvePeriod(fromIso, toIso);

    const users = await this.prisma.user.findMany({
      where: { role: { in: ['USER', 'ADMIN', 'DEVELOPER'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, profilePictureUrl: true },
    });

    const [{ sentMap, receivedMap, lastMsgInPeriod }, { createdMap, closedMap, cancelledMap }] =
      await Promise.all([
        this.whatsappReports.fetchMessageAggregates(from, to),
        this.ticketsReports.fetchTicketAggregates(from, to),
      ]);

    const lastActivityMap = new Map<string, string | null>();
    for (const row of lastMsgInPeriod) {
      lastActivityMap.set(row.userId, row._max.timestamp ? row._max.timestamp.toISOString() : null);
    }
    await mergeTicketActivityMax(this.prisma, from, to, lastActivityMap);

    const perUser: PerUserStats[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      profilePictureUrl: u.profilePictureUrl ?? null,
      messagesSent: sentMap.get(u.id) ?? 0,
      messagesReceived: receivedMap.get(u.id) ?? 0,
      ticketsCreated: createdMap.get(u.id) ?? 0,
      ticketsClosed: closedMap.get(u.id) ?? 0,
      ticketsCancelled: cancelledMap.get(u.id) ?? 0,
      totalActivity: 0,
      lastActivityAt: lastActivityMap.get(u.id) ?? null,
    }));

    for (const row of perUser) {
      row.totalActivity =
        row.messagesSent +
        row.messagesReceived +
        row.ticketsCreated +
        row.ticketsClosed +
        row.ticketsCancelled;
    }

    const totals = perUser.reduce(
      (acc, u) => {
        acc.messagesSent += u.messagesSent;
        acc.messagesReceived += u.messagesReceived;
        acc.ticketsCreated += u.ticketsCreated;
        acc.ticketsClosed += u.ticketsClosed;
        acc.ticketsCancelled += u.ticketsCancelled;
        if (u.totalActivity > 0) acc.activeUsers += 1;
        return acc;
      },
      {
        activeUsers: 0,
        messagesSent: 0,
        messagesReceived: 0,
        ticketsCreated: 0,
        ticketsClosed: 0,
        ticketsCancelled: 0,
        openTickets: 0,
      },
    );

    const funnel = await this.ticketsReports.fetchFunnel();
    totals.openTickets = funnel.reduce((sum, f) => sum + f.count, 0);

    const [{ sentMsgs, receivedMsgs }, { createdTickets, archivedInPeriod }] = await Promise.all([
      this.whatsappReports.fetchDailyMessages(from, to),
      this.ticketsReports.fetchDailyTickets(from, to),
    ]);

    const daily = buildDailySeries(from, to, sentMsgs, receivedMsgs, createdTickets, archivedInPeriod);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals,
      perUser,
      funnel,
      daily,
    };
  }
}
