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
  ticketsArchived: number;
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
  ticketsCreated: number;
  ticketsArchived: number;
}

export interface TeamOverviewResponse {
  period: { from: string; to: string };
  totals: {
    activeUsers: number;
    messagesSent: number;
    messagesReceived: number;
    ticketsCreated: number;
    ticketsArchived: number;
    openTickets: number;
  };
  perUser: PerUserStats[];
  funnel: FunnelStage[];
  daily: DailyPoint[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Visão geral da equipa para ADMIN: agregados no período, por utilizador, e funil actual. */
  async getTeamOverview(actorRole: string, fromIso?: string, toIso?: string): Promise<TeamOverviewResponse> {
    if (actorRole !== 'ADMIN' && actorRole !== 'DEVELOPER') {
      throw new ForbiddenException('Apenas administradores podem ver esta página.');
    }

    const { from, to } = resolvePeriod(fromIso, toIso);

    const users = await this.prisma.user.findMany({
      where: { role: { in: ['USER', 'ADMIN'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, profilePictureUrl: true },
    });

    const [sentGroup, receivedGroup, createdGroup, archivedGroup, lastMsgPerUser] = await Promise.all([
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
        where: { isArchived: true, updatedAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['userId'],
        _max: { timestamp: true },
      }),
    ]);

    const sentMap = mapByUser(sentGroup);
    const receivedMap = mapByUser(receivedGroup);
    const createdMap = mapByUser(createdGroup);
    const archivedMap = mapByUser(archivedGroup);
    const lastActivityMap = new Map<string, string | null>();
    for (const row of lastMsgPerUser) {
      lastActivityMap.set(row.userId, row._max.timestamp ? row._max.timestamp.toISOString() : null);
    }

    const perUser: PerUserStats[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      profilePictureUrl: u.profilePictureUrl ?? null,
      messagesSent: sentMap.get(u.id) ?? 0,
      messagesReceived: receivedMap.get(u.id) ?? 0,
      ticketsCreated: createdMap.get(u.id) ?? 0,
      ticketsArchived: archivedMap.get(u.id) ?? 0,
      lastActivityAt: lastActivityMap.get(u.id) ?? null,
    }));

    const totals = perUser.reduce(
      (acc, u) => {
        acc.messagesSent += u.messagesSent;
        acc.messagesReceived += u.messagesReceived;
        acc.ticketsCreated += u.ticketsCreated;
        acc.ticketsArchived += u.ticketsArchived;
        if (u.messagesSent > 0 || u.ticketsCreated > 0 || u.ticketsArchived > 0) {
          acc.activeUsers += 1;
        }
        return acc;
      },
      { activeUsers: 0, messagesSent: 0, messagesReceived: 0, ticketsCreated: 0, ticketsArchived: 0, openTickets: 0 },
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

    const [sentMsgs, createdTickets, archivedTickets] = await Promise.all([
      this.prisma.message.findMany({
        where: { type: 'sent', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.ticket.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { isArchived: true, updatedAt: { gte: from, lte: to } },
        select: { updatedAt: true },
      }),
    ]);

    const daily = buildDailySeries(from, to, sentMsgs, createdTickets, archivedTickets);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals,
      perUser,
      funnel,
      daily,
    };
  }
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
  createdTickets: { createdAt: Date }[],
  archivedTickets: { updatedAt: Date }[],
): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = dateKey(cursor);
    buckets.set(key, { date: key, messagesSent: 0, ticketsCreated: 0, ticketsArchived: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const ensure = (key: string): DailyPoint => {
    const cur = buckets.get(key);
    if (cur) return cur;
    const item: DailyPoint = { date: key, messagesSent: 0, ticketsCreated: 0, ticketsArchived: 0 };
    buckets.set(key, item);
    return item;
  };

  for (const m of sentMsgs) ensure(dateKey(m.timestamp)).messagesSent += 1;
  for (const t of createdTickets) ensure(dateKey(t.createdAt)).ticketsCreated += 1;
  for (const t of archivedTickets) ensure(dateKey(t.updatedAt)).ticketsArchived += 1;

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
