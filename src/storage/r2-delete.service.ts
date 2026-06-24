import { Injectable } from '@nestjs/common';
import { ListObjectsV2Command, DeleteObjectsCommand, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { R2ConfigService } from './r2-config.service';

@Injectable()
export class R2DeleteService {
  constructor(private readonly config: R2ConfigService) {}

  async deleteFile(fileUrl: string): Promise<void> {
    const cfg = await this.config.resolveR2FromEnvOrDb();
    if (!cfg) return;
    const client = await this.config.getS3Client(cfg);
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
    const cfg = await this.config.resolveR2FromEnvOrDb();
    if (!cfg) return;
    const client = await this.config.getS3Client(cfg);
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
