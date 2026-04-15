import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import 'multer';

@Injectable()
export class R2Service {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  // 1. Upload de ficheiros enviados do seu Frontend para o cliente
  async uploadFile(file: Express.Multer.File, folderName: string): Promise<string> {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const cleanName = file.originalname.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const cleanFolder = folderName.replace(/\D/g, ''); // Garante que a pasta é só o número
      const uniqueKey = `${cleanFolder}/${randomUUID()}-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: uniqueKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);
      return `${process.env.R2_PUBLIC_URL}/${uniqueKey}`;
    } catch (error) {
      console.error('Erro no upload para R2:', error);
      throw new InternalServerErrorException('Falha ao processar arquivo na nuvem.');
    }
  }

  // 2. Upload de ficheiros recebidos do WhatsApp (Evolution API)
  async uploadBuffer(buffer: Buffer, originalName: string, mimeType: string, folderName: string): Promise<string> {
    try {
      const fileExtension = originalName.split('.').pop() || 'bin';
      const cleanName = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const cleanFolder = folderName.replace(/\D/g, '');
      const uniqueKey = `${cleanFolder}/${randomUUID()}-recebido-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: uniqueKey,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.s3Client.send(command);
      return `${process.env.R2_PUBLIC_URL}/${uniqueKey}`;
    } catch (error) {
      console.error('Erro no upload de Buffer para R2:', error);
      throw new InternalServerErrorException('Falha ao salvar arquivo recebido.');
    }
  }
}