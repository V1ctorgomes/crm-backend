import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj, parseDate } from '../revert-snapshot.util';

export async function revertTicketTask(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
