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

  // AGORA RECEBE O "folderName" (que será o número do cliente)
  async uploadFile(file: Express.Multer.File, folderName: string): Promise<string> {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const cleanName = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase();

      // Limpa o nome da pasta (garante que tem apenas números)
      const cleanFolder = folderName.replace(/\D/g, '');

      // A MÁGICA ACONTECE AQUI: Adicionamos o "cleanFolder/" no início!
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
}