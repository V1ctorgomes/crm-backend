import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj } from '../revert-snapshot.util';

export async function revertCompany(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
