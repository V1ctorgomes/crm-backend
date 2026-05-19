import { BadRequestException } from '@nestjs/common';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AUTH_PASSWORD_MIN = 8;
/** bcrypt trunca em 72 bytes — limitar evita abuso de CPU. */
export const AUTH_PASSWORD_MAX = 128;
export const AUTH_NAME_MAX = 120;

export function normalizeEmail(raw: unknown): string {
  const email = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    throw new BadRequestException('Indique um e-mail válido.');
  }
  return email;
}

export function assertPassword(raw: unknown, label = 'palavra-passe'): string {
  const password = String(raw ?? '');
  if (password.length < AUTH_PASSWORD_MIN) {
    throw new BadRequestException(`A ${label} deve ter pelo menos ${AUTH_PASSWORD_MIN} caracteres.`);
  }
  if (password.length > AUTH_PASSWORD_MAX) {
    throw new BadRequestException(`A ${label} não pode exceder ${AUTH_PASSWORD_MAX} caracteres.`);
  }
  return password;
}

export function assertRegisterName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (name.length < 2) {
    throw new BadRequestException('Indique o seu nome (mínimo 2 caracteres).');
  }
  if (name.length > AUTH_NAME_MAX) {
    throw new BadRequestException(`O nome não pode exceder ${AUTH_NAME_MAX} caracteres.`);
  }
  return name;
}
