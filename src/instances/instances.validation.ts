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

export function sanitizeInstanceCreate(data: Record<string, unknown>) {
  const name = sanitizeInstanceName(data.name);
  const proxyHost = data.proxyHost != null ? String(data.proxyHost).trim() : '';
  const proxyPort = data.proxyPort != null ? String(data.proxyPort).trim() : '';
  if (!proxyHost || !proxyPort) {
    throw new BadRequestException(
      'É obrigatório associar uma proxy à instância WhatsApp. Configure uma em Developer → Proxies.',
    );
  }
  const proxyProto = String(data.proxyProto ?? 'http').toLowerCase();
  if (proxyProto !== 'http' && proxyProto !== 'https' && proxyProto !== 'socks5') {
    throw new BadRequestException('Protocolo de proxy inválido.');
  }
  return { name, proxyHost, proxyPort, proxyProto };
}

export function assertUserIdParam(raw: unknown): string {
  return assertUuidParam(raw, 'Utilizador');
}
