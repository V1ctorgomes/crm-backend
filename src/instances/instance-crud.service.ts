import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { sanitizeInstanceCreate } from './instances.validation';
import { maskSecret } from '../common/mask-secret';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';

@Injectable()
export class InstanceCrudService {
  private readonly logger = new Logger(InstanceCrudService.name);

  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
    private evolutionSync: InstanceEvolutionSyncService,
  ) {}

  async findAll() {
    const instances = await this.prisma.instance.findMany({ orderBy: { createdAt: 'desc' } });

    try {
      await Promise.allSettled(instances.map((inst) => this.checkStatus(inst.name)));
    } catch (e) {
      this.logger.warn('Não foi possível verificar o status das instâncias. Verifique as credenciais da API.');
    }

    const rows = await this.prisma.instance.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      ...row,
      proxyPass: row.proxyPass ? maskSecret(row.proxyPass) : null,
    }));
  }

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

  async checkStatus(instanceName: string) {
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: { apikey: evoKey } });
      const state = res.data?.instance?.state === 'open' ? 'connected' : 'disconnected';
      await this.prisma.instance.update({ where: { name: instanceName }, data: { status: state } });
      return { status: state };
    } catch (e) {
      return { status: 'disconnected' };
    }
  }

  async getQrCode(instanceName: string) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName } });
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      return res.data;
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Serviço Indisponível ou Credenciais Inválidas';
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  async updateSettings(instanceName: string, data: any) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName } });
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      await axios.post(
        `${evoUrl}/settings/set/${instanceName}`,
        {
          rejectCall: data.rejectCalls,
          groupsIgnore: data.ignoreGroups,
        },
        { headers: { apikey: evoKey } },
      );
      return await this.prisma.instance.update({
        where: { name: instanceName },
        data: { rejectCalls: data.rejectCalls, ignoreGroups: data.ignoreGroups },
      });
    } catch (e) {
      throw new HttpException('Erro ao atualizar settings', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string, actor: AuditActor, rawReason?: string) {
    const inst = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    if (!inst) {
      throw new HttpException('Instância não encontrada.', HttpStatus.NOT_FOUND);
    }
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      await axios.delete(`${evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: evoKey } });
    } catch (e) {
      this.logger.warn(`Instância ${instanceName} não pôde ser apagada na Evolution (Pode já não existir).`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.instance.delete({ where: { name: instanceName } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.INSTANCE,
        resourceId: instanceName,
        rawReason,
        snapshot: inst,
      });
    });
    return { success: true };
  }
}
