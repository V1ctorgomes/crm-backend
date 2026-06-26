import { BadRequestException } from '@nestjs/common';
import { assertUuidParam } from '../common/uuid-param';

const INSTANCE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function sanitizeInstanceName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!INSTANCE_NAME_RE.test(name)) {
    throw new BadRequestException(
      'Nome da instância inválido (letras, números, _ ou -, até 64 caracteres).',
    );
  }
  return name;
}

export type SanitizedInstanceCreate = {
  name: string;
  proxyId: string | null;
};

export function sanitizeInstanceCreate(data: Record<string, unknown>): SanitizedInstanceCreate {
  const name = sanitizeInstanceName(data.name);

  if (data.proxyHost != null || data.proxyPort != null || data.proxyPass != null || data.proxyUser != null) {
    throw new BadRequestException(
      'Credenciais de proxy não podem ser enviadas pelo cliente. Selecione uma proxy registada (proxyId).',
    );
  }

  const proxyIdRaw = data.proxyId;
  const proxyId =
    proxyIdRaw != null && String(proxyIdRaw).trim() !== ''
      ? assertUuidParam(proxyIdRaw, 'Proxy')
      : null;

  return { name, proxyId };
}

export function assertUserIdParam(raw: unknown): string {
  return assertUuidParam(raw, 'Utilizador');
}
