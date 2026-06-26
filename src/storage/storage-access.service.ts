import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2ConfigService } from './r2-config.service';
import { objectKeyFromPublicUrl } from './r2-key.util';

@Injectable()
export class StorageAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Config: R2ConfigService,
  ) {}

  /**
   * Garante que o utilizador pode ler o objecto R2 (prefixos por userId ou registo na BD).
   */
  async assertUserCanReadObjectKey(userId: string, objectKey: string): Promise<void> {
    const cleanKey = objectKey.replace(/^\/+/, '');
    const ownedPrefixes = [`conversas/${userId}/`, `solicitacoes/${userId}/`, `perfil/${userId}/`];
    if (ownedPrefixes.some((p) => cleanKey.startsWith(p))) {
      return;
    }

    const cfg = await this.r2Config.resolveR2FromEnvOrDb();
    if (!cfg) {
      throw new NotFoundException('Armazenamento não configurado.');
    }
    const publicUrl = `${cfg.publicUrl.replace(/\/+$/, '')}/${cleanKey}`;

    const [message, ticketFile, contact] = await Promise.all([
      this.prisma.message.findFirst({
        where: { userId, OR: [{ mediaData: publicUrl }, { mediaData: { contains: cleanKey } }] },
        select: { id: true },
      }),
      this.prisma.ticketFile.findFirst({
        where: {
          fileUrl: publicUrl,
          ticket: { userId },
        },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { id: userId, profilePictureUrl: { contains: cleanKey } },
        select: { id: true },
      }),
    ]);

    if (message || ticketFile || contact) {
      return;
    }

    throw new ForbiddenException('Sem permissão para aceder a este ficheiro.');
  }

  async resolveObjectKeyFromEncodedUrl(encodedUrl: string): Promise<string> {
    let fileUrl: string;
    try {
      fileUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8');
    } catch {
      throw new NotFoundException('Referência de ficheiro inválida.');
    }
    const cfg = await this.r2Config.assertReady();
    const key = objectKeyFromPublicUrl(fileUrl, cfg);
    if (!key) {
      throw new NotFoundException('URL de ficheiro inválida.');
    }
    return key;
  }
}
