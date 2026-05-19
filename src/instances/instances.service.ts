import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { sanitizeInstanceCreate, sanitizeInstanceName } from './instances.validation';
import { maskSecret } from '../common/mask-secret';

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);
  
  // O webhookUrl mantém-se no .env pois é o endereço do próprio CRM
  private readonly webhookUrl = process.env.WEBHOOK_URL;

  /** Anexa `?token=` se existir WHATSAPP_WEBHOOK_SECRET (validação no POST /whatsapp/webhook). */
  private buildWebhookUrlForEvolution(): string | undefined {
    const base = this.webhookUrl?.trim();
    if (!base) return undefined;
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
    if (!secret || base.includes('token=')) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(secret)}`;
  }

  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
  ) {}

  // Função auxiliar para buscar as credenciais da Evolution diretamente da Base de Dados
  private async getEvolutionCredentials() {
    const provider = await this.prisma.provider.findUnique({ where: { name: 'evolution' } });
    
    if (!provider || !provider.baseUrl || !provider.apiKey) {
      throw new HttpException(
        'Configurações da Evolution API não encontradas. Por favor, configure-as na página Developer.', 
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      evoUrl: provider.baseUrl.replace(/\/$/, ''),
      evoKey: provider.apiKey
    };
  }

  async findByUser(userId: string) {
    const instances = await this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    
    try {
      await Promise.allSettled(instances.map((inst) => this.checkStatus(inst.name)));
    } catch (e) {
      this.logger.warn('Não foi possível verificar o status das instâncias. Verifique as credenciais da API.');
    }
    
    const rows = await this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      ...row,
      proxyPass: row.proxyPass ? maskSecret(row.proxyPass) : null,
    }));
  }

  async create(userId: string, data: Record<string, unknown>) {
    const input = sanitizeInstanceCreate(data);
    // 1. Vai buscar as credenciais atualizadas à BD
    const { evoUrl, evoKey } = await this.getEvolutionCredentials();

    try {
      const payload: any = {
        instanceName: input.name,
        qrcode: false, 
        integration: "WHATSAPP-BAILEYS"
      };

      // 2. Disparar pedido de criação para a Evolution
      await axios.post(`${evoUrl}/instance/create`, payload, { headers: { apikey: evoKey } });
      this.logger.log(`Instância ${input.name} criada com sucesso na Evolution API v2.`);

      // 3. Forçar a configuração do Proxy através do endpoint dedicado
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
            headers: { 'Content-Type': 'application/json', apikey: evoKey } 
          });
          this.logger.log(`Proxy configurado com sucesso para a instância ${input.name}`);
        } catch (proxyErr: any) {
          await axios.delete(`${evoUrl}/instance/delete/${encodeURIComponent(input.name)}`, { headers: { apikey: evoKey } }).catch(() => {});
          let errorMsg = "Erro desconhecido de proxy";
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

      // 4. Configuração do Webhook
      const webhookUrlResolved = this.buildWebhookUrlForEvolution();
      if (webhookUrlResolved) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await axios.post(`${evoUrl}/webhook/set/${encodeURIComponent(input.name)}`, {
          webhook: {
            enabled: true,
            url: webhookUrlResolved,
            byEvents: false, 
            base64: false,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "MESSAGES_DELETE",
              "SEND_MESSAGE",
              "CONNECTION_UPDATE"
            ]
          }
        }, { headers: { apikey: evoKey } }).catch(e => this.logger.warn(`Erro no webhook (ignorado): ${e.message}`));
      }

      // 5. Salvar no Banco de Dados
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
          proxyProto: input.proxyProto,
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
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: { apikey: evoKey } });
      const state = res.data?.instance?.state === 'open' ? 'connected' : 'disconnected';
      await this.prisma.instance.update({ where: { name: instanceName }, data: { status: state } });
      return { status: state };
    } catch (e) { 
      return { status: 'disconnected' }; 
    }
  }

  async getQrCode(userId: string, instanceName: string) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });
    try {
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      return res.data;
    } catch (error: any) { 
      const msg = error?.response?.data?.message || "Serviço Indisponível ou Credenciais Inválidas";
      throw new HttpException(msg, HttpStatus.BAD_REQUEST); 
    }
  }

  async updateSettings(userId: string, instanceName: string, data: any) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName, userId } });
    try {
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
      await axios.post(`${evoUrl}/settings/set/${instanceName}`, {
        rejectCall: data.rejectCalls, groupsIgnore: data.ignoreGroups
      }, { headers: { apikey: evoKey } });
      return await this.prisma.instance.update({ where: { name: instanceName }, data: { rejectCalls: data.rejectCalls, ignoreGroups: data.ignoreGroups } });
    } catch (e) { 
      throw new HttpException('Erro ao atualizar settings', HttpStatus.BAD_REQUEST); 
    }
  }

  async remove(userId: string, instanceName: string, actor: AuditActor, rawReason?: string) {
    const inst = await this.prisma.instance.findFirst({ where: { name: instanceName, userId } });
    if (!inst) {
      throw new HttpException('Instância não encontrada.', HttpStatus.NOT_FOUND);
    }
    try { 
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
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