import { Injectable } from '@nestjs/common';
import type { R2ResolvedConfig } from './r2-config.service';
import { R2ConfigService } from './r2-config.service';
import { R2UploadService } from './r2-upload.service';
import { R2DeleteService } from './r2-delete.service';
import { conversasPath, perfilPath, solicitacoesTicketPath } from './r2-paths.util';

export type { R2ResolvedConfig };

@Injectable()
export class R2Service {
  constructor(
    private readonly config: R2ConfigService,
    private readonly upload: R2UploadService,
    private readonly deleteOps: R2DeleteService,
  ) {}

  resolveR2FromEnvOrDb(): Promise<R2ResolvedConfig | null> {
    return this.config.resolveR2FromEnvOrDb();
  }

  assertReady(): Promise<R2ResolvedConfig> {
    return this.config.assertReady();
  }

  uploadFile(file: Express.Multer.File, folderName: string): Promise<string> {
    return this.upload.uploadFile(file, folderName);
  }

  uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderPath: string,
    stableObjectId?: string,
  ): Promise<string> {
    return this.upload.uploadBuffer(buffer, originalName, mimeType, folderPath, stableObjectId);
  }

  deleteFile(fileUrl: string): Promise<void> {
    return this.deleteOps.deleteFile(fileUrl);
  }

  deleteFolder(folderName: string): Promise<void> {
    return this.deleteOps.deleteFolder(folderName);
  }

  conversasPath(userId: string, contactNumber: string): string {
    return conversasPath(userId, contactNumber);
  }

  solicitacoesTicketPath(userId: string, ticketId: string): string {
    return solicitacoesTicketPath(userId, ticketId);
  }

  perfilPath(userId: string): string {
    return perfilPath(userId);
  }
}
