import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj, parseDate } from '../revert-snapshot.util';

export async function revertContact(tx: Prisma.TransactionClient, snapshot: Prisma.JsonValue): Promise<void> {
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
