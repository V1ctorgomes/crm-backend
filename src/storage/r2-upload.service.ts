import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { R2ConfigService } from './r2-config.service';

@Injectable()
export class R2UploadService {
  constructor(private readonly config: R2ConfigService) {}

  async uploadFile(file: Express.Multer.File, folderName: string): Promise<string> {
    const cfg = await this.config.assertReady();
    const client = await this.config.getS3Client(cfg);
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

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderPath: string,
    stableObjectId?: string,
  ): Promise<string> {
    const cfg = await this.config.assertReady();
    const client = await this.config.getS3Client(cfg);
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
}
