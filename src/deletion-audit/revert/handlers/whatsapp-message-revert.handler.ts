import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asObj, parseDate } from '../revert-snapshot.util';

export async function revertWhatsappMessage(
  tx: Prisma.TransactionClient,
  snapshot: Prisma.JsonValue,
): Promise<void> {
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
