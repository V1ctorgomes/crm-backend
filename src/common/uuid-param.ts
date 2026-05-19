import { BadRequestException } from '@nestjs/common';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valida IDs UUID usados pelo Prisma neste projecto. */
export function assertUuidParam(raw: unknown, label = 'identificador'): string {
  const id = String(raw ?? '').trim();
  if (!id || !UUID_RE.test(id)) {
    throw new BadRequestException(`${label} inválido.`);
  }
  return id;
}
