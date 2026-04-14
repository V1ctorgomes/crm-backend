import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import 'multer';

@Injectable()
export class R2Service {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      // Colocamos o "!" no final para garantir ao TypeScript que a variável existe
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const cleanName = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase();

      const uniqueKey = `${uuidv4()}-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!, // Colocado o "!" aqui também
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