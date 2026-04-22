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

  // 1. Upload de ficheiros enviados do seu Frontend para o cliente
  async uploadFile(file: any, folderName: string): Promise<string> {
    try {
      const safeFile = file as any;
      const fileExtension = String(safeFile.originalname || '').split('.').pop() || 'bin';
      const cleanName = String(safeFile.originalname || '').replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const cleanFolder = String(folderName).replace(/\D/g, ''); 
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

  // 3. NOVO: Apagar todos os ficheiros de um cliente (pasta inteira)
  async deleteFolder(folderName: string): Promise<void> {
    try {
      const cleanFolder = folderName.replace(/\D/g, '');
      const prefix = `${cleanFolder}/`;
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;

      // Loop para garantir que apaga tudo, mesmo se houver mais de 1000 ficheiros
      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME!,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listedObjects = await this.s3Client.send(listCommand);

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
          break; // A pasta já está vazia ou não existe
        }

        const deleteParams = {
          Bucket: process.env.R2_BUCKET_NAME!,
          Delete: {
            // CORREÇÃO AQUI: Garante que só passa itens válidos e força o tipo para o TS não reclamar
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
      
      console.log(`Todos os ficheiros da pasta ${prefix} foram apagados do R2 com sucesso.`);
    } catch (error) {
      console.error('Erro ao deletar pasta no R2 (pode não existir):', error);
      // Não lançamos erro aqui para não impedir que o banco de dados seja limpo caso o R2 falhe
    }
  }
}