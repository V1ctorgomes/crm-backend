import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionResourceType } from './deletion-audit.constants';

/** Janela em que o admin pode reverter exclusões feitas por utilizadores de atendimento (USER). */
export const USER_DELETION_REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SUPPORTED_REVERT_TYPES = new Set<string>([
  DeletionResourceType.TICKET_NOTE,
  DeletionResourceType.TICKET_TASK,
  DeletionResourceType.TICKET_STAGE,
  DeletionResourceType.TICKET,
  DeletionResourceType.CONTACT_COMPANY_LINK,
  DeletionResourceType.COMPANY,
  DeletionResourceType.CONTACT,
  DeletionResourceType.WHATSAPP_MESSAGE,
]);

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

@Injectable()
export class DeletionRevertService {
  private readonly logger = new Logger(DeletionRevertService.name);

  constructor(private readonly prisma: PrismaService) {}

  private withinRevertWindow(createdAt: Date): boolean {
    return Date.now() - createdAt.getTime() <= USER_DELETION_REVERT_WINDOW_MS;
  }

  private revertBlockReason(row: {
    actorRole: string;
    revertedAt: Date | null;
    createdAt: Date;
    snapshot: Prisma.JsonValue | null;
    resourceType: string;
  }): string | null {
    if (row.actorRole !== 'USER') {
      return 'Apenas exclusões feitas por utilizadores de atendimento podem ser revertidas aqui.';
    }
    if (row.revertedAt) return 'Já foi restaurado.';
    if (!this.withinRevertWindow(row.createdAt)) {
      return 'Passou o prazo de 24 horas para restaurar.';
    }
    if (row.snapshot === null || row.snapshot === undefined) {
      return 'Não há cópia dos dados gravada para esta exclusão.';
    }
    if (!SUPPORTED_REVERT_TYPES.has(row.resourceType)) {
      return 'Este tipo de exclusão não pode ser restaurado automaticamente.';
    }
    return null;
  }

  async listRecentUserDeletions() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.deletionAudit.findMany({
      where: {
        actorRole: 'USER',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        actorEmail: true,
        actorRole: true,
        resourceType: true,
        resourceId: true,
        reason: true,
        revertedAt: true,
        revertedByUserId: true,
        snapshot: true,
      },
    });

    const items = rows.map((r) => {
      const block = this.revertBlockReason(r);
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorUserId: r.actorUserId,
        actorEmail: r.actorEmail,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        reason: r.reason,
        revertedAt: r.revertedAt?.toISOString() ?? null,
        revertedByUserId: r.revertedByUserId,
        canRevert: block === null,
        revertBlockedReason: block,
      };
    });

    const revertibleCount = items.filter((i) => i.canRevert).length;
    return { items, revertibleCount };
  }

  async revertUserDeletion(auditId: string, adminUserId: string) {
    const row = await this.prisma.deletionAudit.findUnique({ where: { id: auditId } });
    if (!row) {
      throw new HttpException('Registo de exclusão não encontrado.', HttpStatus.NOT_FOUND);
    }
    const block = this.revertBlockReason(row);
    if (block) {
      throw new HttpException(block, HttpStatus.BAD_REQUEST);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.applyRevert(tx, row.resourceType, row.snapshot);
        await tx.deletionAudit.update({
          where: { id: auditId },
          data: { revertedAt: new Date(), revertedByUserId: adminUserId },
        });
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`Falha ao reverter auditoria ${auditId}: ${String(e)}`);
      throw new HttpException(
        e instanceof Error ? e.message : 'Não foi possível restaurar este registo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { success: true };
  }

  private async applyRevert(
    tx: Prisma.TransactionClient,
    resourceType: string,
    snapshot: Prisma.JsonValue,
  ): Promise<void> {
    switch (resourceType) {
      case DeletionResourceType.TICKET_NOTE:
        await this.revertTicketNote(tx, snapshot);
        return;
      case DeletionResourceType.TICKET_TASK:
        await this.revertTicketTask(tx, snapshot);
        return;
      case DeletionResourceType.TICKET_STAGE:
        await this.revertTicketStage(tx, snapshot);
        return;
      case DeletionResourceType.TICKET:
        await this.revertTicket(tx, snapshot);
        return;
      case DeletionResourceType.CONTACT_COMPANY_LINK:
        await this.revertContactCompanyLink(tx, snapshot);
        return;
      case DeletionResourceType.COMPANY:
        await this.revertCompany(tx, snapshot);
        return;
      case DeletionResourceType.CONTACT:
        await this.revertContact(tx, snapshot);
        return;
      case DeletionResourceType.WHATSAPP_MESSAGE:
        await this.revertWhatsappMessage(tx, snapshot);
        return;
      default:
        throw new HttpException('Tipo não suportado.', HttpStatus.BAD_REQUEST);
    }
  }

  private async revertTicketNote(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s?.ticketId || typeof s.ticketId !== 'string' || typeof s.text !== 'string') {
      throw new HttpException('Cópia da nota inválida.', HttpStatus.BAD_REQUEST);
    }
    const ticket = await tx.ticket.findFirst({
      where: { id: s.ticketId as string },
      select: { id: true },
    });
    if (!ticket) throw new HttpException('A solicitação (OS) já não existe; não é possível restaurar a nota.', HttpStatus.BAD_REQUEST);
    await tx.note.create({
      data: { ticketId: s.ticketId as string, text: s.text as string },
    });
  }

  private async revertTicketTask(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s?.ticketId || typeof s.ticketId !== 'string' || typeof s.title !== 'string') {
      throw new HttpException('Cópia da tarefa inválida.', HttpStatus.BAD_REQUEST);
    }
    const due = parseDate(s.dueDate);
    if (!due) throw new HttpException('Data da tarefa inválida na cópia.', HttpStatus.BAD_REQUEST);
    const ticket = await tx.ticket.findFirst({
      where: { id: s.ticketId as string },
      select: { id: true },
    });
    if (!ticket) throw new HttpException('A solicitação (OS) já não existe; não é possível restaurar a tarefa.', HttpStatus.BAD_REQUEST);
    await tx.task.create({
      data: {
        ticketId: s.ticketId as string,
        title: s.title as string,
        dueDate: due,
        isCompleted: Boolean(s.isCompleted),
      },
    });
  }

  private async revertTicketStage(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da fase inválida.', HttpStatus.BAD_REQUEST);
    const sid = typeof s?.id === 'string' ? s.id : null;
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const name = typeof s?.name === 'string' ? s.name : null;
    if (!userId || !name) throw new HttpException('Cópia da fase inválida.', HttpStatus.BAD_REQUEST);
    const color = typeof s.color === 'string' ? s.color : '#e2e8f0';
    const order = typeof s.order === 'number' ? s.order : 0;
    const isActive = s.isActive !== false;
    if (sid) {
      const byId = await tx.stage.findUnique({ where: { id: sid }, select: { id: true } });
      if (byId) {
        throw new HttpException('Esta fase já voltou a existir.', HttpStatus.CONFLICT);
      }
      await tx.stage.create({
        data: { id: sid, userId, name, color, order, isActive },
      });
      return;
    }
    const existing = await tx.stage.findFirst({
      where: { userId, name, order },
      select: { id: true },
    });
    if (existing) {
      throw new HttpException('Já existe uma fase equivalente; não foi feita a duplicação.', HttpStatus.CONFLICT);
    }
    await tx.stage.create({
      data: { userId, name, color, order, isActive },
    });
  }

  private async revertContactCompanyLink(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da ligação inválida.', HttpStatus.BAD_REQUEST);
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const contactNumber = typeof s?.contactNumber === 'string' ? s.contactNumber : null;
    const companyId = typeof s?.companyId === 'string' ? s.companyId : null;
    if (!userId || !contactNumber || !companyId) {
      throw new HttpException('Cópia da ligação inválida.', HttpStatus.BAD_REQUEST);
    }
    await tx.contactCompany.upsert({
      where: {
        userId_contactNumber_companyId: { userId, contactNumber, companyId },
      },
      create: { userId, contactNumber, companyId },
      update: {},
    });
  }

  private async revertCompany(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da empresa inválida.', HttpStatus.BAD_REQUEST);
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const legalName = typeof s?.legalName === 'string' ? s.legalName : null;
    const cnpj = typeof s?.cnpj === 'string' ? s.cnpj : null;
    if (!userId || !legalName || !cnpj) throw new HttpException('Cópia da empresa inválida.', HttpStatus.BAD_REQUEST);
    const tradeName = s.tradeName === null || s.tradeName === undefined ? null : String(s.tradeName);
    try {
      await tx.company.create({
        data: { userId, legalName, tradeName, cnpj },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpException('Já existe uma empresa com este CNPJ para este utilizador.', HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  private async revertContact(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia do contacto inválida.', HttpStatus.BAD_REQUEST);
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const number = typeof s?.number === 'string' ? s.number : null;
    if (!userId || !number) throw new HttpException('Cópia do contacto inválida.', HttpStatus.BAD_REQUEST);
    const existing = await tx.contact.findUnique({
      where: { number_userId: { number, userId } },
      select: { number: true },
    });
    if (existing) {
      throw new HttpException('Este contacto já voltou a existir; não é necessário restaurar.', HttpStatus.CONFLICT);
    }
    const kindRaw = typeof s.contactKind === 'string' ? s.contactKind.toUpperCase() : 'UNKNOWN';
    const contactKind =
      kindRaw === 'CUSTOMER' || kindRaw === 'INTERNAL' || kindRaw === 'UNKNOWN' ? kindRaw : 'UNKNOWN';
    await tx.contact.create({
      data: {
        number,
        userId,
        instanceName: s.instanceName == null ? null : String(s.instanceName),
        name: s.name == null ? null : String(s.name),
        profilePictureUrl: s.profilePictureUrl == null ? null : String(s.profilePictureUrl),
        lastMessage: s.lastMessage == null ? null : String(s.lastMessage),
        lastMessageTime: parseDate(s.lastMessageTime),
        email: s.email == null ? null : String(s.email),
        cnpj: s.cnpj == null ? null : String(s.cnpj),
        contactKind: contactKind as 'UNKNOWN' | 'CUSTOMER' | 'INTERNAL',
      },
    });
  }

  private async revertWhatsappMessage(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da mensagem inválida.', HttpStatus.BAD_REQUEST);
    const id = typeof s?.id === 'string' ? s.id : null;
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const contactNumber = typeof s?.contactNumber === 'string' ? s.contactNumber : null;
    const text = typeof s?.text === 'string' ? s.text : '';
    const type = typeof s?.type === 'string' ? s.type : 'sent';
    if (!id || !userId || !contactNumber) {
      throw new HttpException('Cópia da mensagem inválida.', HttpStatus.BAD_REQUEST);
    }
    const existing = await tx.message.findUnique({ where: { id }, select: { id: true } });
    if (existing) {
      throw new HttpException('Esta mensagem já existe no histórico interno.', HttpStatus.CONFLICT);
    }
    const ts = parseDate(s.timestamp) ?? new Date();
    await tx.message.create({
      data: {
        id,
        userId,
        contactNumber,
        instanceName: s.instanceName == null ? null : String(s.instanceName),
        text,
        type,
        isMedia: Boolean(s.isMedia),
        mediaData: s.mediaData == null ? null : String(s.mediaData),
        mimeType: s.mimeType == null ? null : String(s.mimeType),
        fileName: s.fileName == null ? null : String(s.fileName),
        groupSenderLabel: s.groupSenderLabel == null ? null : String(s.groupSenderLabel),
        timestamp: ts,
      },
    });
  }

  private async revertTicket(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue) {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da OS incompleta.', HttpStatus.BAD_REQUEST);
    const id = typeof s?.id === 'string' ? s.id : null;
    const userId = typeof s?.userId === 'string' ? s.userId : null;
    const contactNumber = typeof s?.contactNumber === 'string' ? s.contactNumber : null;
    const stageId = typeof s?.stageId === 'string' ? s.stageId : null;
    if (!id || !userId || !contactNumber || !stageId) {
      throw new HttpException('Cópia da OS incompleta.', HttpStatus.BAD_REQUEST);
    }
    const exists = await tx.ticket.findUnique({ where: { id }, select: { id: true } });
    if (exists) {
      throw new HttpException('Esta OS já existe de novo.', HttpStatus.CONFLICT);
    }
    const stage = await tx.stage.findFirst({ where: { id: stageId, userId }, select: { id: true } });
    if (!stage) {
      throw new HttpException('A fase original já não existe; não é possível restaurar a OS.', HttpStatus.BAD_REQUEST);
    }
    const contact = await tx.contact.findUnique({
      where: { number_userId: { number: contactNumber, userId } },
      select: { number: true },
    });
    if (!contact) {
      throw new HttpException('O contacto original já não existe; não é possível restaurar a OS.', HttpStatus.BAD_REQUEST);
    }
    let companyId: string | null = null;
    if (typeof s.companyId === 'string' && s.companyId) {
      const co = await tx.company.findFirst({ where: { id: s.companyId, userId }, select: { id: true } });
      companyId = co?.id ?? null;
    }
    const notes = Array.isArray(s.notes) ? s.notes : [];
    const tasks = Array.isArray(s.tasks) ? s.tasks : [];
    await tx.ticket.create({
      data: {
        id,
        userId,
        contactNumber,
        stageId,
        companyId,
        marca: s.marca == null ? null : String(s.marca),
        modelo: s.modelo == null ? null : String(s.modelo),
        customerType: s.customerType == null ? null : String(s.customerType),
        ticketType: s.ticketType == null ? null : String(s.ticketType),
        isArchived: Boolean(s.isArchived),
        resolution: s.resolution == null ? null : String(s.resolution),
        resolutionReason: s.resolutionReason == null ? null : String(s.resolutionReason),
        notes: {
          create: notes
            .map((n) => asObj(n))
            .filter((n): n is Record<string, unknown> => !!n && typeof n.text === 'string')
            .map((n) => ({ text: n.text as string })),
        },
        tasks: {
          create: tasks
            .map((t) => asObj(t))
            .filter((t): t is Record<string, unknown> => !!t && typeof t.title === 'string' && t.dueDate != null)
            .map((t) => {
              const due = parseDate(t.dueDate);
              if (!due) return null;
              return {
                title: t.title as string,
                dueDate: due,
                isCompleted: Boolean(t.isCompleted),
              };
            })
            .filter((x): x is { title: string; dueDate: Date; isCompleted: boolean } => x !== null),
        },
      },
    });
  }
}
