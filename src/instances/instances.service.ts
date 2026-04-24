import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);
  private readonly evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly evoKey = process.env.EVOLUTION_API_KEY;
  private readonly webhookUrl = process.env.WEBHOOK_URL; 

  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) {
    const instances = await this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    for (const inst of instances) {
      await this.checkStatus(inst.name);
    }
    return this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(data: any) {
    if (!this.evoUrl || !this.evoKey) throw new HttpException('Configuração Evolution ausente.', HttpStatus.BAD_REQUEST);

    try {
      // 1. Estruturar os dados do proxy isoladamente
      let proxyData: any = undefined;
      if (data.proxyHost && data.proxyPort) {
        proxyData = {
          host: String(data.proxyHost).trim(),
          port: Number(data.proxyPort), // Exigência da Evolution: Porta tem de ser Número
          protocol: String(data.proxyProto || "http").toLowerCase().trim() // Exigência: minúsculas
        };
        
        if (data.proxyUser && data.proxyPass) {
          proxyData.username = String(data.proxyUser).trim();
          proxyData.password = String(data.proxyPass).trim();
        }
      }

      // 2. Criar a estrutura Base para criar a instância (A injeção direta funciona em algumas versões)
      const payload: any = {
        instanceName: data.name,
        qrcode: false, 
        integration: "WHATSAPP-BAILEYS",
        ...(proxyData && { proxy: proxyData }) 
      };

      // 3. Disparar pedido de criação para a Evolution
      await axios.post(`${this.evoUrl}/instance/create`, payload, { headers: { apikey: this.evoKey } });
      this.logger.log(`Instância ${data.name} criada com sucesso na Evolution API v2.`);

      // 4. Forçar a configuração do Proxy através do endpoint dedicado
      if (proxyData) {
        // CORREÇÃO: A Evolution exige que o body seja { enabled: true, proxy: { ... } }
        const proxySetPayload = {
          enabled: true,
          proxy: proxyData
        };

        try {
          await axios.post(`${this.evoUrl}/proxy/set/${data.name}`, proxySetPayload, { 
            headers: { 
              'Content-Type': 'application/json',
              apikey: this.evoKey 
            } 
          });
          this.logger.log(`Proxy configurado com sucesso para a instância ${data.name}`);
        } catch (proxyErr: any) {
          // Reverte a criação da instância na Evolution para não criar lixo no servidor
          await axios.delete(`${this.evoUrl}/instance/delete/${data.name}`, { headers: { apikey: this.evoKey } }).catch(() => {});
          
          const errorMsg = proxyErr?.response?.data?.message || proxyErr?.response?.data?.error || proxyErr.message;
          throw new HttpException(`A Evolution rejeitou o Proxy: ${errorMsg}`, HttpStatus.BAD_REQUEST);
        }
      }

      // 5. Configuração do Webhook
      if (this.webhookUrl) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await axios.post(`${this.evoUrl}/webhook/set/${data.name}`, {
          webhook: {
            enabled: true,
            url: this.webhookUrl,
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
        }, { headers: { apikey: this.evoKey } }).catch(e => this.logger.warn(`Erro no webhook (ignorado): ${e.message}`));
      }

      // 6. Salvar no Banco de Dados local apenas se tudo deu certo
      return await this.prisma.instance.create({ 
        data: {
          name: data.name, 
          userId: data.userId,
          rejectCalls: data.rejectCalls || false, 
          ignoreGroups: data.ignoreGroups || false,
          proxyHost: data.proxyHost || null, 
          proxyPort: data.proxyPort ? String(data.proxyPort) : null, 
          proxyUser: data.proxyUser || null, 
          proxyPass: data.proxyPass || null, 
          proxyProto: data.proxyProto || 'http'
        } 
      });

    } catch (error: any) {
      if (error instanceof HttpException) throw error; // Se foi erro de Proxy, repassa
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message;
      this.logger.error(`Erro na criação da Instância: ${msg}`);
      throw new HttpException(`Erro Evolution: ${msg}`, HttpStatus.BAD_REQUEST);
    }
  }

  async checkStatus(instanceName: string) {
    try {
      const res = await axios.get(`${this.evoUrl}/instance/connectionState/${instanceName}`, { headers: { apikey: this.evoKey } });
      const state = res.data?.instance?.state === 'open' ? 'connected' : 'disconnected';
      await this.prisma.instance.update({ where: { name: instanceName }, data: { status: state } });
      return { status: state };
    } catch (e) { return { status: 'disconnected' }; }
  }

  async getQrCode(instanceName: string) {
    try {
      const res = await axios.get(`${this.evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: this.evoKey } });
      return res.data;
    } catch (error: any) { 
      const msg = error?.response?.data?.message || "Serviço Indisponível";
      throw new HttpException(msg, HttpStatus.BAD_REQUEST); 
    }
  }

  async updateSettings(instanceName: string, data: any) {
    try {
      await axios.post(`${this.evoUrl}/settings/set/${instanceName}`, {
        rejectCall: data.rejectCalls, groupsIgnore: data.ignoreGroups
      }, { headers: { apikey: this.evoKey } });
      return await this.prisma.instance.update({ where: { name: instanceName }, data: { rejectCalls: data.rejectCalls, ignoreGroups: data.ignoreGroups } });
    } catch (e) { throw new HttpException('Erro ao atualizar settings', HttpStatus.BAD_REQUEST); }
  }

  async remove(instanceName: string) {
    try { await axios.delete(`${this.evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: this.evoKey } }); } catch (e) {}
    return this.prisma.instance.delete({ where: { name: instanceName } });
  }
}