// @ts-nocheck
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

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

  async uploadFile(file: any, folderName: string): Promise<string> {
    try {
      const safeFile = file as any;
      const fileExtension = String(safeFile.originalname || '').split('.').pop() || 'bin';
      const cleanName = String(safeFile.originalname || '').replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      // Permite o uso de barras para subpastas de tickets
      const cleanFolder = String(folderName).replace(/[^a-zA-Z0-9_/-]/g, ''); 
      const uniqueKey = `${cleanFolder}/${randomUUID()}-${cleanName}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: uniqueKey,
        Body: safeFile.buffer,
        ContentType: safeFile.mimetype || 'application/octet-stream',
      });

      await this.s3Client.send(command);
      return `${process.env.R2_PUBLIC_URL}/${uniqueKey}`;
    } catch (error) {
      console.error('Erro no upload para R2:', error);
      throw new InternalServerErrorException('Falha ao processar arquivo na nuvem.');
    }
  }

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

  // Apaga um arquivo único usando a sua URL pública
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1); // Remove a barra inicial
      const command = new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Delete: { Objects: [{ Key: key }] },
      });
      await this.s3Client.send(command);
    } catch (error) {
      console.error('Erro ao deletar ficheiro único do R2:', error);
    }
  }

  async deleteFolder(folderName: string): Promise<void> {
    try {
      const cleanFolder = folderName.replace(/[^a-zA-Z0-9_/-]/g, '');
      const prefix = `${cleanFolder}/`;
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME!,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listedObjects = await this.s3Client.send(listCommand);

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
          break; 
        }

        const deleteParams = {
          Bucket: process.env.R2_BUCKET_NAME!,
          Delete: {
            Objects: listedObjects.Contents
              .filter(item => item.Key !== undefined)
              .map(item => ({ Key: item.Key as string })),
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await this.s3Client.send(deleteCommand);

        isTruncated = listedObjects.IsTruncated ?? false;
        continuationToken = listedObjects.NextContinuationToken;
      }
    } catch (error) {
      console.error('Erro ao deletar pasta no R2:', error);
    }
  }
}