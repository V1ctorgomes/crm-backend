import { BadRequestException } from '@nestjs/common';
import { isMaskedSecretInput } from '../common/mask-secret';

const ALLOWED_PROVIDERS = new Set(['evolution', 'cloudflare']);

function assertHttpsUrl(raw: unknown, label: string, optional = false): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) {
    if (optional) return undefined;
    throw new BadRequestException(`O campo «${label}» é obrigatório.`);
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new BadRequestException(`URL inválida em «${label}».`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(`«${label}» deve usar http ou https.`);
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new BadRequestException(`«${label}» deve ser HTTPS em produção.`);
  }
  return url.toString().replace(/\/+$/, '');
}

export function assertProviderName(name: string): string {
  const n = String(name || '').trim().toLowerCase();
  if (!ALLOWED_PROVIDERS.has(n)) {
    throw new BadRequestException('Provedor não suportado.');
  }
  return n;
}

export type SanitizedProviderUpsert = {
  baseUrl?: string;
  apiKey?: string;
  apiToken?: string;
  bucket?: string;
  region?: string;
  accountId?: string;
};

export function sanitizeProviderUpsert(
  providerName: string,
  data: Record<string, unknown>,
): SanitizedProviderUpsert {
  assertProviderName(providerName);
  const out: SanitizedProviderUpsert = {};

  if (data.baseUrl !== undefined) {
    out.baseUrl = assertHttpsUrl(data.baseUrl, 'URL base');
  }
  if (data.accountId !== undefined) {
    const id = String(data.accountId ?? '').trim();
    if (id.length > 128) throw new BadRequestException('accountId demasiado longo.');
    out.accountId = id || undefined;
  }
  if (data.bucket !== undefined) {
    const b = String(data.bucket ?? '').trim();
    if (b.length > 128) throw new BadRequestException('bucket demasiado longo.');
    out.bucket = b || undefined;
  }
  if (data.region !== undefined) {
    const r = String(data.region ?? '').trim();
    if (r.length > 64) throw new BadRequestException('region demasiado longa.');
    out.region = r || undefined;
  }
  if (data.apiKey !== undefined && !isMaskedSecretInput(data.apiKey)) {
    const k = String(data.apiKey).trim();
    if (k.length > 512) throw new BadRequestException('apiKey demasiado longa.');
    out.apiKey = k;
  }
  if (data.apiToken !== undefined && !isMaskedSecretInput(data.apiToken)) {
    const t = String(data.apiToken).trim();
    if (t.length > 512) throw new BadRequestException('apiToken demasiado longo.');
    out.apiToken = t;
  }

  return out;
}
