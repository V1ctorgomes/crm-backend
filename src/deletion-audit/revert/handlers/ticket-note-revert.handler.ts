import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj } from '../revert-snapshot.util';

export async function revertTicketNote(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
