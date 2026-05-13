import { HttpException, HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
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
export class R2Service {
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

  private async getS3Client(cfg: R2ResolvedConfig): Promise<S3Client> {
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

  async uploadFile(file: Express.Multer.File, folderName: string): Promise<string> {
    const cfg = await this.assertReady();
    const client = await this.getS3Client(cfg);
    try {
      const safeFile = file as Express.Multer.File;
      const fileExtension = String(safeFile.originalname || '').split('.').pop() || 'bin';
      const cleanName = String(safeFile.originalname || '')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase();
      const cleanFolder = String(folderName).replace(/[^a-zA-Z0-9_/-]/g, '');
      const uniqueKey = `${cleanFolder}/${randomUUID()}-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: uniqueKey,
        Body: safeFile.buffer,
        ContentType: safeFile.mimetype || 'application/octet-stream',
      });

      await client.send(command);
      return `${cfg.publicUrl}/${uniqueKey}`;
    } catch (error) {
      console.error('Erro no upload para R2:', error);
      throw new InternalServerErrorException('Falha ao processar arquivo na nuvem.');
    }
  }

  conversasPath(userId: string, contactNumber: string): string {
    const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const num = String(contactNumber).replace(/\D/g, '');
    return `${uid}/conversas/${num}`;
  }

  solicitacoesTicketPath(userId: string, ticketId: string): string {
    const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const tid = String(ticketId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${uid}/solicitacoes/${tid}`;
  }

  perfilPath(userId: string): string {
    const uid = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${uid}/perfil`;
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderPath: string,
    stableObjectId?: string,
  ): Promise<string> {
    const cfg = await this.assertReady();
    const client = await this.getS3Client(cfg);
    try {
      const fileExtension = originalName.split('.').pop() || 'bin';
      const cleanName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      const cleanFolder = String(folderPath)
        .replace(/[^a-zA-Z0-9_/-]/g, '')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '');
      const safeStable = stableObjectId
        ? String(stableObjectId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 220)
        : '';
      const uniqueKey = safeStable
        ? `${cleanFolder}/${safeStable}.${fileExtension}`
        : `${cleanFolder}/${randomUUID()}-recebido-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: uniqueKey,
        Body: buffer,
        ContentType: mimeType,
      });

      await client.send(command);
      return `${cfg.publicUrl}/${uniqueKey}`;
    } catch (error) {
      console.error('Erro no upload de Buffer para R2:', error);
      throw new InternalServerErrorException('Falha ao salvar arquivo recebido.');
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const cfg = await this.resolveR2FromEnvOrDb();
    if (!cfg) return;
    const client = await this.getS3Client(cfg);
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1);
      const command = new DeleteObjectsCommand({
        Bucket: cfg.bucket,
        Delete: { Objects: [{ Key: key }] },
      });
      await client.send(command);
    } catch (error) {
      console.error('Erro ao deletar ficheiro único do R2:', error);
    }
  }

  async deleteFolder(folderName: string): Promise<void> {
    const cfg = await this.resolveR2FromEnvOrDb();
    if (!cfg) return;
    const client = await this.getS3Client(cfg);
    try {
      const cleanFolder = folderName.replace(/[^a-zA-Z0-9_/-]/g, '');
      const prefix = `${cleanFolder}/`;
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: cfg.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listedObjects = await client.send(listCommand);
        const listOut = listedObjects as ListObjectsV2CommandOutput;

        if (!listOut.Contents || listOut.Contents.length === 0) {
          break;
        }

        const deleteParams = {
          Bucket: cfg.bucket,
          Delete: {
            Objects: listOut.Contents.filter((item) => item.Key !== undefined).map((item) => ({
              Key: item.Key as string,
            })),
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await client.send(deleteCommand);

        isTruncated = listOut.IsTruncated ?? false;
        continuationToken = listOut.NextContinuationToken;
      }
    } catch (error) {
      console.error('Erro ao deletar pasta no R2:', error);
    }
  }
}
