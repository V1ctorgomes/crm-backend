import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { maskSecret } from '../common/mask-secret';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { sanitizeInstanceCreate } from './instances.validation';

@Injectable()
export class InstanceCreateService {
  private readonly logger = new Logger(InstanceCreateService.name);

  constructor(
    private prisma: PrismaService,
    private evolutionSync: InstanceEvolutionSyncService,
  ) {}

  async create(userId: string, data: Record<string, unknown>) {
    const input = sanitizeInstanceCreate(data);
    const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();

    try {
      const payload: any = {
        instanceName: input.name,
        qrcode: false,
        integration: 'WHATSAPP-BAILEYS',
      };

      await axios.post(`${evoUrl}/instance/create`, payload, { headers: { apikey: evoKey } });
      this.logger.log(`Instância ${input.name} criada com sucesso na Evolution API v2.`);

      if (input.proxyHost && input.proxyPort) {
        const proxySetPayload: any = {
          enabled: true,
          host: input.proxyHost,
          port: input.proxyPort,
          protocol: input.proxyProto,
        };

        if (data.proxyUser && data.proxyPass) {
          proxySetPayload.username = String(data.proxyUser).trim();
          proxySetPayload.password = String(data.proxyPass).trim();
        }

        try {
          await axios.post(`${evoUrl}/proxy/set/${encodeURIComponent(input.name)}`, proxySetPayload, {
            headers: { 'Content-Type': 'application/json', apikey: evoKey },
          });
          this.logger.log(`Proxy configurado com sucesso para a instância ${input.name}`);
        } catch (proxyErr: any) {
          await axios
            .delete(`${evoUrl}/instance/delete/${encodeURIComponent(input.name)}`, { headers: { apikey: evoKey } })
            .catch(() => {});
          let errorMsg = 'Erro desconhecido de proxy';
          const resData = proxyErr?.response?.data;

          if (resData) {
            if (Array.isArray(resData.message)) {
              errorMsg = resData.message.map((m: any) => m.message || JSON.stringify(m)).join(', ');
            } else {
              errorMsg = resData.message || resData.error || proxyErr.message;
            }
          }
          throw new HttpException(`A Evolution rejeitou o Proxy: ${errorMsg}`, HttpStatus.BAD_REQUEST);
        }
      }

      if (this.evolutionSync.getWebhookUrl()) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          await this.evolutionSync.applyEvolutionWebhook(input.name);
        } catch (e: any) {
          this.logger.warn(`Erro ao configurar webhook (ignorado): ${e?.message ?? e}`);
        }
      }

      const created = await this.prisma.instance.create({
        data: {
          name: input.name,
          userId,
          rejectCalls: Boolean(data.rejectCalls),
          ignoreGroups: Boolean(data.ignoreGroups),
          proxyHost: input.proxyHost || null,
          proxyPort: input.proxyPort || null,
          proxyUser: data.proxyUser ? String(data.proxyUser) : null,
          proxyPass: data.proxyPass ? String(data.proxyPass) : null,
          proxyProto: input.proxyProto || null,
        },
      });
      return {
        ...created,
        proxyPass: created.proxyPass ? maskSecret(created.proxyPass) : null,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;

      let msg = error.message;
      if (error?.response?.data) {
        if (Array.isArray(error.response.data.message)) {
          msg = error.response.data.message.map((m: any) => m.message || JSON.stringify(m)).join(', ');
        } else {
          msg = error.response.data.message || error.response.data.error;
        }
      }

      this.logger.error(`Erro na criação da Instância: ${msg}`);
      throw new HttpException(`Erro Evolution: ${msg}`, HttpStatus.BAD_REQUEST);
    }
  }
}
