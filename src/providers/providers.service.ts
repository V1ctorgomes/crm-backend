import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { maskSecret } from '../common/mask-secret';
import {
  assertProviderName,
  sanitizeProviderUpsert,
  type SanitizedProviderUpsert,
} from './providers.validation';

function toPublicProvider(row: {
  name: string;
  baseUrl: string | null;
  apiKey: string | null;
  apiToken: string | null;
  bucket: string | null;
  region: string | null;
  accountId: string | null;
}) {
  return {
    name: row.name,
    baseUrl: row.baseUrl,
    bucket: row.bucket,
    region: row.region,
    accountId: row.accountId,
    apiKeySet: Boolean(row.apiKey),
    apiTokenSet: Boolean(row.apiToken),
    apiKey: maskSecret(row.apiKey),
    apiToken: maskSecret(row.apiToken),
  };
}

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async getProvider(name: string) {
    const providerName = assertProviderName(name);
    const provider = await this.prisma.provider.findUnique({ where: { name: providerName } });
    if (!provider) {
      return { name: providerName, apiKeySet: false, apiTokenSet: false };
    }
    return toPublicProvider(provider);
  }

  async upsertProvider(name: string, data: Record<string, unknown>) {
    const providerName = assertProviderName(name);
    const patch = sanitizeProviderUpsert(providerName, data);
    const existing = await this.prisma.provider.findUnique({ where: { name: providerName } });

    const dataToWrite = buildProviderWrite(patch, existing);

    if (existing) {
      const row = await this.prisma.provider.update({
        where: { name: providerName },
        data: dataToWrite,
      });
      return toPublicProvider(row);
    }

    const baseUrl = dataToWrite.baseUrl;
    if (!baseUrl) {
      throw new BadRequestException('URL base é obrigatória ao criar o provedor.');
    }
    if (!dataToWrite.apiKey) {
      throw new BadRequestException('Chave API é obrigatória ao criar o provedor.');
    }

    const row = await this.prisma.provider.create({
      data: {
        name: providerName,
        baseUrl,
        apiKey: dataToWrite.apiKey,
        apiToken: dataToWrite.apiToken,
        bucket: dataToWrite.bucket,
        region: dataToWrite.region,
        accountId: dataToWrite.accountId,
      },
    });
    return toPublicProvider(row);
  }
}

function buildProviderWrite(
  patch: SanitizedProviderUpsert,
  existing: {
    baseUrl: string | null;
    apiKey: string | null;
    apiToken: string | null;
    bucket: string | null;
    region: string | null;
    accountId: string | null;
  } | null,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (patch.baseUrl !== undefined) out.baseUrl = patch.baseUrl;
  else if (existing?.baseUrl) out.baseUrl = existing.baseUrl;
  if (patch.apiKey !== undefined) out.apiKey = patch.apiKey;
  else if (existing?.apiKey) out.apiKey = existing.apiKey;
  if (patch.apiToken !== undefined) out.apiToken = patch.apiToken;
  else if (existing?.apiToken) out.apiToken = existing.apiToken;
  if (patch.bucket !== undefined) out.bucket = patch.bucket;
  else if (existing?.bucket) out.bucket = existing.bucket ?? undefined;
  if (patch.region !== undefined) out.region = patch.region;
  else if (existing?.region) out.region = existing.region ?? undefined;
  if (patch.accountId !== undefined) out.accountId = patch.accountId;
  else if (existing?.accountId) out.accountId = existing.accountId ?? undefined;
  return out;
}
