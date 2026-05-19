import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PerUserStats {
  userId: string;
  name: string;
  email: string;
  role: string;
  profilePictureUrl: string | null;
  messagesSent: number;
  messagesReceived: number;
  ticketsCreated: number;
  ticketsClosed: number;
  ticketsCancelled: number;
  totalActivity: number;
  lastActivityAt: string | null;
}

export interface FunnelStage {
  name: string;
  color: string;
  count: number;
}

export interface DailyPoint {
  date: string;
  messagesSent: number;
  messagesReceived: number;
  ticketsCreated: number;
  ticketsClosed: number;
  ticketsCancelled: number;
}

export interface TeamOverviewResponse {
  period: { from: string; to: string };
  totals: {
    activeUsers: number;
    messagesSent: number;
    messagesReceived: number;
    ticketsCreated: number;
    ticketsClosed: number;
    ticketsCancelled: number;
    openTickets: number;
  };
  perUser: PerUserStats[];
  funnel: FunnelStage[];
  daily: DailyPoint[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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

    const [sentGroup, receivedGroup, createdGroup, closedGroup, cancelledGroup, lastMsgInPeriod] = await Promise.all([
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
      this.prisma.message.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: from, lte: to } },
        _max: { timestamp: true },
      }),
    ]);

    const sentMap = mapByUser(sentGroup);
    const receivedMap = mapByUser(receivedGroup);
    const createdMap = mapByUser(createdGroup);
    const closedMap = mapByUser(closedGroup);
    const cancelledMap = mapByUser(cancelledGroup);

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
    const funnel = Array.from(funnelMap.values()).sort((a, b) => b.count - a.count);
    totals.openTickets = funnel.reduce((sum, f) => sum + f.count, 0);

    const [sentMsgs, receivedMsgs, createdTickets, archivedInPeriod] = await Promise.all([
      this.prisma.message.findMany({
        where: { type: 'sent', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.message.findMany({
        where: { type: 'received', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.ticket.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { isArchived: true, updatedAt: { gte: from, lte: to } },
        select: { updatedAt: true, resolution: true },
      }),
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

async function mergeTicketActivityMax(
  prisma: PrismaService,
  from: Date,
  to: Date,
  lastActivityMap: Map<string, string | null>,
): Promise<void> {
  const [createdMax, closedMax, cancelledMax] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: from, lte: to } },
      _max: { createdAt: true },
    }),
    prisma.ticket.groupBy({
      by: ['userId'],
      where: {
        isArchived: true,
        updatedAt: { gte: from, lte: to },
        NOT: { resolution: 'CANCELLED' },
      },
      _max: { updatedAt: true },
    }),
    prisma.ticket.groupBy({
      by: ['userId'],
      where: {
        isArchived: true,
        updatedAt: { gte: from, lte: to },
        resolution: 'CANCELLED',
      },
      _max: { updatedAt: true },
    }),
  ]);
  for (const row of createdMax) {
    const iso = row._max.createdAt?.toISOString() ?? null;
    mergeMaxIso(lastActivityMap, row.userId, iso);
  }
  for (const row of closedMax) {
    const iso = row._max.updatedAt?.toISOString() ?? null;
    mergeMaxIso(lastActivityMap, row.userId, iso);
  }
  for (const row of cancelledMax) {
    const iso = row._max.updatedAt?.toISOString() ?? null;
    mergeMaxIso(lastActivityMap, row.userId, iso);
  }
}

function mergeMaxIso(map: Map<string, string | null>, userId: string, iso: string | null): void {
  if (!iso) return;
  const cur = map.get(userId);
  if (!cur || new Date(iso) > new Date(cur)) map.set(userId, iso);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDailySeries(
  from: Date,
  to: Date,
  sentMsgs: { timestamp: Date }[],
  receivedMsgs: { timestamp: Date }[],
  createdTickets: { createdAt: Date }[],
  archivedInPeriod: { updatedAt: Date; resolution: string | null }[],
): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = dateKey(cursor);
    buckets.set(key, {
      date: key,
      messagesSent: 0,
      messagesReceived: 0,
      ticketsCreated: 0,
      ticketsClosed: 0,
      ticketsCancelled: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const ensure = (key: string): DailyPoint => {
    const cur = buckets.get(key);
    if (cur) return cur;
    const item: DailyPoint = {
      date: key,
      messagesSent: 0,
      messagesReceived: 0,
      ticketsCreated: 0,
      ticketsClosed: 0,
      ticketsCancelled: 0,
    };
    buckets.set(key, item);
    return item;
  };

  for (const m of sentMsgs) ensure(dateKey(m.timestamp)).messagesSent += 1;
  for (const m of receivedMsgs) ensure(dateKey(m.timestamp)).messagesReceived += 1;
  for (const t of createdTickets) ensure(dateKey(t.createdAt)).ticketsCreated += 1;
  for (const t of archivedInPeriod) {
    const day = ensure(dateKey(t.updatedAt));
    if (t.resolution === 'CANCELLED') day.ticketsCancelled += 1;
    else day.ticketsClosed += 1;
  }

  return Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function mapByUser<T extends { userId: string; _count: { _all: number } }>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.userId, r._count._all);
  return m;
}

/** Período padrão: últimos 30 dias terminando agora. Limites razoáveis para evitar consultas explosivas. */
function resolvePeriod(fromIso?: string, toIso?: string): { from: Date; to: Date } {
  const now = new Date();
  let to = toIso ? new Date(toIso) : now;
  let from = fromIso ? new Date(fromIso) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(to.getTime())) to = now;
  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from > to) [from, to] = [to, from];

  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) {
    from = new Date(to.getTime() - maxRangeMs);
  }
  return { from, to };
}
