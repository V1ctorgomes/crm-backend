import { BadRequestException } from '@nestjs/common';
import { isMaskedSecretInput } from '../common/mask-secret';

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const HOST_MAX = 253;

export type SanitizedProxyInput = {
  name: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  protocol: string;
};

export function sanitizeProxyInput(data: {
  name?: unknown;
  host?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  protocol?: unknown;
}): SanitizedProxyInput {
  const name = String(data.name ?? '').trim();
  if (!NAME_RE.test(name)) {
    throw new BadRequestException(
      'Nome do proxy inválido (use letras, números, _ ou -, até 64 caracteres).',
    );
  }

  const host = String(data.host ?? '').trim();
  if (!host || host.length > HOST_MAX) {
    throw new BadRequestException('Host do proxy inválido.');
  }

  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException('Porta do proxy inválida (1–65535).');
  }

  const protocol = String(data.protocol ?? 'http').toLowerCase();
  if (protocol !== 'http' && protocol !== 'https' && protocol !== 'socks5') {
    throw new BadRequestException('Protocolo do proxy inválido.');
  }

  const usernameRaw = String(data.username ?? '').trim();
  const passwordRaw = isMaskedSecretInput(data.password)
    ? null
    : String(data.password ?? '').trim() || null;

  return {
    name,
    host,
    port,
    username: usernameRaw || null,
    password: passwordRaw,
    protocol,
  };
}
