import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj } from '../revert-snapshot.util';

export async function revertContactCompanyLink(
  tx: Prisma.TransactionClient,
  snapshot: Prisma.JsonValue,
): Promise<void> {
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
