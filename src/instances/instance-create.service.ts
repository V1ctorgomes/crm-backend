import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { decryptField, encryptField } from '../common/field-crypto';
import { maskSecret } from '../common/mask-secret';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { sanitizeInstanceCreate } from './instances.validation';

type ResolvedProxy = {
  host: string;
  port: string;
  username: string | null;
  password: string | null;
  protocol: string;
};

@Injectable()
export class InstanceCreateService {
  private readonly logger = new Logger(InstanceCreateService.name);

  constructor(
    private prisma: PrismaService,
    private evolutionSync: InstanceEvolutionSyncService,
  ) {}

  private async resolveProxy(proxyId: string): Promise<ResolvedProxy> {
    const proxy = await this.prisma.proxy.findUnique({ where: { id: proxyId } });
    if (!proxy) {
      throw new HttpException('Proxy não encontrada.', HttpStatus.BAD_REQUEST);
    }
    return {
      host: proxy.host,
      port: String(proxy.port),
      username: proxy.username,
      password: decryptField(proxy.password),
      protocol: proxy.protocol,
    };
  }

  async create(userId: string, data: Record<string, unknown>) {
    const input = sanitizeInstanceCreate(data);
    const proxy = input.proxyId ? await this.resolveProxy(input.proxyId) : null;
    const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();

    try {
      const payload: Record<string, unknown> = {
        instanceName: input.name,
        qrcode: false,
        integration: 'WHATSAPP-BAILEYS',
      };

      await axios.post(`${evoUrl}/instance/create`, payload, { headers: { apikey: evoKey } });
      this.logger.log(`Instância ${input.name} criada com sucesso na Evolution API v2.`);

      if (proxy) {
        const proxySetPayload: Record<string, unknown> = {
          enabled: true,
          host: proxy.host,
          port: Number(proxy.port),
          protocol: proxy.protocol,
        };

        if (proxy.username && proxy.password) {
          proxySetPayload.username = proxy.username;
          proxySetPayload.password = proxy.password;
        }

        try {
          await axios.post(`${evoUrl}/proxy/set/${encodeURIComponent(input.name)}`, proxySetPayload, {
            headers: { 'Content-Type': 'application/json', apikey: evoKey },
          });
          this.logger.log(`Proxy configurado com sucesso para a instância ${input.name}`);
        } catch (proxyErr: unknown) {
          await axios
            .delete(`${evoUrl}/instance/delete/${encodeURIComponent(input.name)}`, { headers: { apikey: evoKey } })
            .catch(() => {});
          let errorMsg = 'Erro desconhecido de proxy';
          const err = proxyErr as { response?: { data?: { message?: unknown; error?: string } }; message?: string };
          const resData = err?.response?.data;

          if (resData) {
            if (Array.isArray(resData.message)) {
              errorMsg = resData.message.map((m: { message?: string }) => m.message || JSON.stringify(m)).join(', ');
            } else {
              errorMsg = String(resData.message || resData.error || err.message);
            }
          }
          throw new HttpException(`A Evolution rejeitou o Proxy: ${errorMsg}`, HttpStatus.BAD_REQUEST);
        }
      }

      if (this.evolutionSync.getWebhookUrl()) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          await this.evolutionSync.applyEvolutionWebhook(input.name);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Erro ao configurar webhook (ignorado): ${msg}`);
        }
      }

      const created = await this.prisma.instance.create({
        data: {
          name: input.name,
          userId,
          rejectCalls: Boolean(data.rejectCalls),
          ignoreGroups: Boolean(data.ignoreGroups),
          proxyHost: proxy?.host || null,
          proxyPort: proxy?.port || null,
          proxyUser: proxy?.username || null,
          proxyPass: proxy?.password ? encryptField(proxy.password) : null,
          proxyProto: proxy?.protocol || null,
        },
      });
      return {
        ...created,
        proxyPass: created.proxyPass ? maskSecret(decryptField(created.proxyPass)) : null,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      const err = error as { message?: string; response?: { data?: { message?: unknown; error?: string } } };
      let msg = err.message ?? 'Erro desconhecido';
      if (err?.response?.data) {
        if (Array.isArray(err.response.data.message)) {
          msg = err.response.data.message
            .map((m: { message?: string }) => m.message || JSON.stringify(m))
            .join(', ');
        } else {
          msg = String(err.response.data.message || err.response.data.error);
        }
      }

      this.logger.error(`Erro na criação da Instância: ${msg}`);
      throw new HttpException(`Erro Evolution: ${msg}`, HttpStatus.BAD_REQUEST);
    }
  }
}
