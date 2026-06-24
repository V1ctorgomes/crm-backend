import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { buildEvolutionWebhookConfig } from '../common/evolution-webhook.util';

@Injectable()
export class InstanceEvolutionSyncService {
  private readonly logger = new Logger(InstanceEvolutionSyncService.name);
  private readonly webhookUrl = process.env.WEBHOOK_URL;

  constructor(private readonly prisma: PrismaService) {}

  async getEvolutionCredentials() {
    const provider = await this.prisma.provider.findUnique({ where: { name: 'evolution' } });

    if (!provider || !provider.baseUrl || !provider.apiKey) {
      throw new HttpException(
        'Configurações da Evolution API não encontradas. Por favor, configure-as na página Developer.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      evoUrl: provider.baseUrl.replace(/\/$/, ''),
      evoKey: provider.apiKey,
    };
  }

  async applyEvolutionWebhook(instanceName: string): Promise<void> {
    const webhook = buildEvolutionWebhookConfig();
    if (!webhook) {
      this.logger.warn('WEBHOOK_URL não definido; webhook da Evolution não foi configurado.');
      return;
    }
    const { evoUrl, evoKey } = await this.getEvolutionCredentials();
    await axios.post(
      `${evoUrl}/webhook/set/${encodeURIComponent(instanceName)}`,
      { webhook },
      { headers: { apikey: evoKey } },
    );
    this.logger.log(`Webhook CRM aplicado na instância ${instanceName}.`);
  }

  async syncAllWebhooks(): Promise<{ synced: string[]; failed: { name: string; error: string }[] }> {
    const instances = await this.prisma.instance.findMany({ select: { name: true }, orderBy: { createdAt: 'desc' } });
    const synced: string[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const inst of instances) {
      try {
        await this.applyEvolutionWebhook(inst.name);
        synced.push(inst.name);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || 'Erro desconhecido';
        failed.push({ name: inst.name, error: String(msg) });
        this.logger.warn(`Falha ao sincronizar webhook (${inst.name}): ${msg}`);
      }
    }
    return { synced, failed };
  }

  getWebhookUrl(): string | undefined {
    return this.webhookUrl?.trim() || undefined;
  }
}
