import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';

export type R2ResolvedConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** URL pública sem barra final */
  publicUrl: string;
};

@Injectable()
export class R2ConfigService {
  private clientCache: { sig: string; client: S3Client } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ordem: variáveis `R2_*` no ambiente (Docker / Easypanel), senão registo `Provider` com nome `cloudflare`
   * guardado na página Developer (Account ID, bucket, keys, URL pública).
   */
  async resolveR2FromEnvOrDb(): Promise<R2ResolvedConfig | null> {
    const t = (s?: string | null) => (typeof s === 'string' ? s.trim() : '');
    const ep = t(process.env.R2_ENDPOINT);
    const ak = t(process.env.R2_ACCESS_KEY_ID);
    const sk = t(process.env.R2_SECRET_ACCESS_KEY);
    const bk = t(process.env.R2_BUCKET_NAME);
    const pu = t(process.env.R2_PUBLIC_URL).replace(/\/+$/, '');
    if (ep && ak && sk && bk && pu) {
      return { endpoint: ep, accessKeyId: ak, secretAccessKey: sk, bucket: bk, publicUrl: pu };
    }

    const p = await this.prisma.provider.findUnique({ where: { name: 'cloudflare' } });
    if (!p) return null;
    const accessKeyId = t(p.apiKey);
    const secretAccessKey = t(p.apiToken);
    const bucket = t(p.bucket);
    const publicUrl = t(p.baseUrl).replace(/\/+$/, '');
    const accountId = t(p.accountId);
    if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl || !accountId) {
      return null;
    }
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    return { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl };
  }

  async assertReady(): Promise<R2ResolvedConfig> {
    const c = await this.resolveR2FromEnvOrDb();
    if (!c) {
      throw new HttpException(
        'Envio de ficheiros não está configurado: defina as variáveis R2_* no servidor (Easypanel) ou guarde a secção Cloudflare R2 na página Developer (Account ID, bucket, chaves e URL pública).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return c;
  }

  async getS3Client(cfg: R2ResolvedConfig): Promise<S3Client> {
    const sig = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.bucket}`;
    if (this.clientCache?.sig === sig) {
      return this.clientCache.client;
    }
    const client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    this.clientCache = { sig, client };
    return client;
  }
}
