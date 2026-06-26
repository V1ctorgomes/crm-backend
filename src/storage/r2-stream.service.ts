import { Injectable, NotFoundException } from '@nestjs/common';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { R2ConfigService } from './r2-config.service';
import { objectKeyFromPublicUrl } from './r2-key.util';

@Injectable()
export class R2StreamService {
  constructor(private readonly config: R2ConfigService) {}

  async streamObjectByKey(objectKey: string, res: Response): Promise<void> {
    const cfg = await this.config.assertReady();
    const client = await this.config.getS3Client(cfg);
    const out = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );
    if (!out.Body) {
      throw new NotFoundException('Ficheiro não encontrado.');
    }
    if (out.ContentType) {
      res.setHeader('Content-Type', out.ContentType);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    const stream = out.Body as NodeJS.ReadableStream;
    stream.pipe(res);
  }

  async streamObjectByPublicUrl(fileUrl: string, res: Response): Promise<void> {
    const cfg = await this.config.assertReady();
    const key = objectKeyFromPublicUrl(fileUrl, cfg);
    if (!key) {
      throw new NotFoundException('URL de ficheiro inválida.');
    }
    await this.streamObjectByKey(key, res);
  }
}
