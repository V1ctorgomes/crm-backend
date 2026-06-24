import { HttpException, HttpStatus } from '@nestjs/common';

export const FIELD_TEXT_MAX = 200;

export function minText(v: string, label: string): void {
  const t = v.trim();
  if (!t) throw new HttpException(`O campo «${label}» é obrigatório.`, HttpStatus.BAD_REQUEST);
  if (t.length < 2) throw new HttpException(`O campo «${label}» deve ter pelo menos 2 caracteres.`, HttpStatus.BAD_REQUEST);
  if (t.length > FIELD_TEXT_MAX) {
    throw new HttpException(
      `O campo «${label}» não pode exceder ${FIELD_TEXT_MAX} caracteres.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
