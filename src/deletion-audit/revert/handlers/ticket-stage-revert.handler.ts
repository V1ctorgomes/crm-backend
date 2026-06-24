import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj } from '../revert-snapshot.util';

export async function revertTicketStage(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
