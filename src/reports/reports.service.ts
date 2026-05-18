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
  mediaMessagesSent: number;
  ticketsCreated: number;
  ticketsArchived: number;
  notesAdded: number;
  tasksCreated: number;
  tasksCompleted: number;
  ticketFilesUploaded: number;
  companiesCreated: number;
  deletionsRecorded: number;
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
  mediaMessagesSent: number;
  ticketsCreated: number;
  ticketsArchived: number;
  notesAdded: number;
  tasksCreated: number;
  tasksCompleted: number;
  ticketFilesUploaded: number;
  deletionsRecorded: number;
}

export interface TeamOverviewResponse {
  period: { from: string; to: string };
  totals: {
    activeUsers: number;
    messagesSent: number;
    messagesReceived: number;
    mediaMessagesSent: number;
    ticketsCreated: number;
    ticketsArchived: number;
    openTickets: number;
    notesAdded: number;
    tasksCreated: number;
    tasksCompleted: number;
    ticketFilesUploaded: number;
    companiesCreated: number;
    deletionsRecorded: number;
  };
  perUser: PerUserStats[];
  funnel: FunnelStage[];
  daily: DailyPoint[];
}

type CountRow = { userId: string; c: bigint };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Visão geral da equipe para ADMIN/DEVELOPER: actividade real no período (WhatsApp, OS, notas, tarefas, ficheiros, empresas, exclusões). */
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

    const [
      sentGroup,
      receivedGroup,
      mediaSentGroup,
      createdGroup,
      archivedGroup,
      companiesGroup,
      lastMsgInPeriod,
      notesRows,
      tasksCreatedRows,
      tasksCompletedRows,
      filesRows,
      deletionsRows,
    ] = await Promise.all([
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
        where: { type: 'sent', isMedia: true, timestamp: { gte: from, lte: to } },
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
      this.prisma.company.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.message.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: from, lte: to } },
        _max: { timestamp: true },
      }),
      this.prisma.$queryRaw<CountRow[]>`
        SELECT t."userId" AS "userId", COUNT(*)::bigint AS c
        FROM "Note" n
        INNER JOIN "Ticket" t ON t."id" = n."ticketId"
        WHERE n."createdAt" >= ${from} AND n."createdAt" <= ${to}
        GROUP BY t."userId"
      `,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT t."userId" AS "userId", COUNT(*)::bigint AS c
        FROM "Task" tk
        INNER JOIN "Ticket" t ON t."id" = tk."ticketId"
        WHERE tk."createdAt" >= ${from} AND tk."createdAt" <= ${to}
        GROUP BY t."userId"
      `,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT t."userId" AS "userId", COUNT(*)::bigint AS c
        FROM "Task" tk
        INNER JOIN "Ticket" t ON t."id" = tk."ticketId"
        WHERE tk."isCompleted" = true
          AND tk."updatedAt" >= ${from} AND tk."updatedAt" <= ${to}
        GROUP BY t."userId"
      `,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT t."userId" AS "userId", COUNT(*)::bigint AS c
        FROM "TicketFile" f
        INNER JOIN "Ticket" t ON t."id" = f."ticketId"
        WHERE f."createdAt" >= ${from} AND f."createdAt" <= ${to}
        GROUP BY t."userId"
      `,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT d."actorUserId" AS "userId", COUNT(*)::bigint AS c
        FROM "deletion_audits" d
        WHERE d."createdAt" >= ${from} AND d."createdAt" <= ${to}
        GROUP BY d."actorUserId"
      `,
    ]);

    const sentMap = mapByUser(sentGroup);
    const receivedMap = mapByUser(receivedGroup);
    const mediaSentMap = mapByUser(mediaSentGroup);
    const createdMap = mapByUser(createdGroup);
    const archivedMap = mapByUser(archivedGroup);
    const companiesMap = mapByUser(companiesGroup);
    const notesMap = mapFromRaw(notesRows);
    const tasksCreatedMap = mapFromRaw(tasksCreatedRows);
    const tasksCompletedMap = mapFromRaw(tasksCompletedRows);
    const filesMap = mapFromRaw(filesRows);
    const deletionsMap = mapFromRaw(deletionsRows);

    const lastActivityMap = new Map<string, string | null>();
    for (const row of lastMsgInPeriod) {
      lastActivityMap.set(row.userId, row._max.timestamp ? row._max.timestamp.toISOString() : null);
    }
    await mergeTicketActivityMax(this.prisma, from, to, lastActivityMap);
    await mergeNoteTaskFileMax(this.prisma, from, to, lastActivityMap);

    const perUser: PerUserStats[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      profilePictureUrl: u.profilePictureUrl ?? null,
      messagesSent: sentMap.get(u.id) ?? 0,
      messagesReceived: receivedMap.get(u.id) ?? 0,
      mediaMessagesSent: mediaSentMap.get(u.id) ?? 0,
      ticketsCreated: createdMap.get(u.id) ?? 0,
      ticketsArchived: archivedMap.get(u.id) ?? 0,
      notesAdded: notesMap.get(u.id) ?? 0,
      tasksCreated: tasksCreatedMap.get(u.id) ?? 0,
      tasksCompleted: tasksCompletedMap.get(u.id) ?? 0,
      ticketFilesUploaded: filesMap.get(u.id) ?? 0,
      companiesCreated: companiesMap.get(u.id) ?? 0,
      deletionsRecorded: deletionsMap.get(u.id) ?? 0,
      totalActivity: 0,
      lastActivityAt: lastActivityMap.get(u.id) ?? null,
    }));

    for (const row of perUser) {
      row.totalActivity =
        row.messagesSent +
        row.messagesReceived +
        row.mediaMessagesSent +
        row.ticketsCreated +
        row.ticketsArchived +
        row.notesAdded +
        row.tasksCreated +
        row.tasksCompleted +
        row.ticketFilesUploaded +
        row.companiesCreated +
        row.deletionsRecorded;
    }

    const totals = perUser.reduce(
      (acc, u) => {
        acc.messagesSent += u.messagesSent;
        acc.messagesReceived += u.messagesReceived;
        acc.mediaMessagesSent += u.mediaMessagesSent;
        acc.ticketsCreated += u.ticketsCreated;
        acc.ticketsArchived += u.ticketsArchived;
        acc.notesAdded += u.notesAdded;
        acc.tasksCreated += u.tasksCreated;
        acc.tasksCompleted += u.tasksCompleted;
        acc.ticketFilesUploaded += u.ticketFilesUploaded;
        acc.companiesCreated += u.companiesCreated;
        acc.deletionsRecorded += u.deletionsRecorded;
        if (u.totalActivity > 0) acc.activeUsers += 1;
        return acc;
      },
      {
        activeUsers: 0,
        messagesSent: 0,
        messagesReceived: 0,
        mediaMessagesSent: 0,
        ticketsCreated: 0,
        ticketsArchived: 0,
        openTickets: 0,
        notesAdded: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        ticketFilesUploaded: 0,
        companiesCreated: 0,
        deletionsRecorded: 0,
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

    const [
      sentMsgs,
      receivedMsgs,
      mediaMsgs,
      createdTickets,
      archivedTickets,
      dailyNotes,
      dailyTasksCreated,
      dailyTasksCompleted,
      dailyFiles,
      dailyDeletions,
    ] = await Promise.all([
      this.prisma.message.findMany({
        where: { type: 'sent', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.message.findMany({
        where: { type: 'received', timestamp: { gte: from, lte: to } },
        select: { timestamp: true },
      }),
      this.prisma.message.findMany({
        where: { type: 'sent', isMedia: true, timestamp: { gte: from, lte: to } },
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
      this.prisma.note.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.task.findMany({
        where: { isCompleted: true, updatedAt: { gte: from, lte: to } },
        select: { updatedAt: true },
      }),
      this.prisma.ticketFile.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.deletionAudit.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
    ]);

    const daily = buildDailySeries(
      from,
      to,
      sentMsgs,
      receivedMsgs,
      mediaMsgs,
      createdTickets,
      archivedTickets,
      dailyNotes,
      dailyTasksCreated,
      dailyTasksCompleted,
      dailyFiles,
      dailyDeletions,
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals,
      perUser,
      funnel,
      daily,
    };
  }
}

function mapFromRaw(rows: CountRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.userId, Number(r.c));
  return m;
}

async function mergeTicketActivityMax(
  prisma: PrismaService,
  from: Date,
  to: Date,
  lastActivityMap: Map<string, string | null>,
): Promise<void> {
  const [createdMax, archMax] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: from, lte: to } },
      _max: { createdAt: true },
    }),
    prisma.ticket.groupBy({
      by: ['userId'],
      where: { isArchived: true, updatedAt: { gte: from, lte: to } },
      _max: { updatedAt: true },
    }),
  ]);
  for (const row of createdMax) {
    const iso = row._max.createdAt?.toISOString() ?? null;
    mergeMaxIso(lastActivityMap, row.userId, iso);
  }
  for (const row of archMax) {
    const iso = row._max.updatedAt?.toISOString() ?? null;
    mergeMaxIso(lastActivityMap, row.userId, iso);
  }
}

async function mergeNoteTaskFileMax(
  prisma: PrismaService,
  from: Date,
  to: Date,
  lastActivityMap: Map<string, string | null>,
): Promise<void> {
  const batches = await Promise.all([
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT t."userId" AS "userId", MAX(n."createdAt") AS mx
      FROM "Note" n
      INNER JOIN "Ticket" t ON t."id" = n."ticketId"
      WHERE n."createdAt" >= ${from} AND n."createdAt" <= ${to}
      GROUP BY t."userId"
    `,
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT t."userId" AS "userId", MAX(tk."createdAt") AS mx
      FROM "Task" tk
      INNER JOIN "Ticket" t ON t."id" = tk."ticketId"
      WHERE tk."createdAt" >= ${from} AND tk."createdAt" <= ${to}
      GROUP BY t."userId"
    `,
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT t."userId" AS "userId", MAX(tk."updatedAt") AS mx
      FROM "Task" tk
      INNER JOIN "Ticket" t ON t."id" = tk."ticketId"
      WHERE tk."isCompleted" = true AND tk."updatedAt" >= ${from} AND tk."updatedAt" <= ${to}
      GROUP BY t."userId"
    `,
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT t."userId" AS "userId", MAX(f."createdAt") AS mx
      FROM "TicketFile" f
      INNER JOIN "Ticket" t ON t."id" = f."ticketId"
      WHERE f."createdAt" >= ${from} AND f."createdAt" <= ${to}
      GROUP BY t."userId"
    `,
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT c."userId" AS "userId", MAX(c."createdAt") AS mx
      FROM "Company" c
      WHERE c."createdAt" >= ${from} AND c."createdAt" <= ${to}
      GROUP BY c."userId"
    `,
    prisma.$queryRaw<{ userId: string; mx: Date }[]>`
      SELECT d."actorUserId" AS "userId", MAX(d."createdAt") AS mx
      FROM "deletion_audits" d
      WHERE d."createdAt" >= ${from} AND d."createdAt" <= ${to}
      GROUP BY d."actorUserId"
    `,
  ]);
  for (const batch of batches) {
    for (const row of batch) {
      mergeMaxIso(lastActivityMap, row.userId, row.mx ? new Date(row.mx).toISOString() : null);
    }
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
  mediaMsgs: { timestamp: Date }[],
  createdTickets: { createdAt: Date }[],
  archivedTickets: { updatedAt: Date }[],
  notes: { createdAt: Date }[],
  tasksCreated: { createdAt: Date }[],
  tasksCompleted: { updatedAt: Date }[],
  files: { createdAt: Date }[],
  deletions: { createdAt: Date }[],
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
      mediaMessagesSent: 0,
      ticketsCreated: 0,
      ticketsArchived: 0,
      notesAdded: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      ticketFilesUploaded: 0,
      deletionsRecorded: 0,
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
      mediaMessagesSent: 0,
      ticketsCreated: 0,
      ticketsArchived: 0,
      notesAdded: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      ticketFilesUploaded: 0,
      deletionsRecorded: 0,
    };
    buckets.set(key, item);
    return item;
  };

  for (const m of sentMsgs) ensure(dateKey(m.timestamp)).messagesSent += 1;
  for (const m of receivedMsgs) ensure(dateKey(m.timestamp)).messagesReceived += 1;
  for (const m of mediaMsgs) ensure(dateKey(m.timestamp)).mediaMessagesSent += 1;
  for (const t of createdTickets) ensure(dateKey(t.createdAt)).ticketsCreated += 1;
  for (const t of archivedTickets) ensure(dateKey(t.updatedAt)).ticketsArchived += 1;
  for (const n of notes) ensure(dateKey(n.createdAt)).notesAdded += 1;
  for (const t of tasksCreated) ensure(dateKey(t.createdAt)).tasksCreated += 1;
  for (const t of tasksCompleted) ensure(dateKey(t.updatedAt)).tasksCompleted += 1;
  for (const f of files) ensure(dateKey(f.createdAt)).ticketFilesUploaded += 1;
  for (const d of deletions) ensure(dateKey(d.createdAt)).deletionsRecorded += 1;

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
