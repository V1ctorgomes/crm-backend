import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj, parseDate } from '../revert-snapshot.util';

export async function revertTicket(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
