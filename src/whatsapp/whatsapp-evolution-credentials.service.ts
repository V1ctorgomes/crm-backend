import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappEvolutionCredentialsService {
  private cache: { baseUrl: string; apiKey: string; expiresAt: number } | null = null;
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<{ baseUrl: string; apiKey: string }> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return { baseUrl: this.cache.baseUrl, apiKey: this.cache.apiKey };
    }
    const provider = await this.prisma.provider.findUnique({ where: { name: 'evolution' } });
    const envUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const envKey = String(process.env.EVOLUTION_API_KEY || '');
    const baseUrl = (provider?.baseUrl?.replace(/\/$/, '') || envUrl).trim();
    const apiKey = (provider?.apiKey || envKey).trim();
    if (!baseUrl || !apiKey) {
      throw new HttpException(
        'Evolution API não configurada. Configure em Developer → Provedores.',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.cache = { baseUrl, apiKey, expiresAt: now + WhatsappEvolutionCredentialsService.TTL_MS };
    return { baseUrl, apiKey };
  }
}
