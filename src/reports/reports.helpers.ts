import { PrismaService } from '../prisma/prisma.service';
import type { DailyPoint } from './reports.types';

export async function mergeTicketActivityMax(
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

export function mergeMaxIso(map: Map<string, string | null>, userId: string, iso: string | null): void {
  if (!iso) return;
  const cur = map.get(userId);
  if (!cur || new Date(iso) > new Date(cur)) map.set(userId, iso);
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildDailySeries(
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

export function mapByUser<T extends { userId: string; _count: { _all: number } }>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.userId, r._count._all);
  return m;
}

/** Período padrão: últimos 30 dias terminando agora. Limites razoáveis para evitar consultas explosivas. */
export function resolvePeriod(fromIso?: string, toIso?: string): { from: Date; to: Date } {
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
