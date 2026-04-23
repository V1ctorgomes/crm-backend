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
      // 1. Criar a Instância (SEM qrcode, para não iniciar a conexão com o IP nativo do servidor)
      const payload: any = {
        instanceName: data.name,
        qrcode: false, 
        integration: "WHATSAPP-BAILEYS"
      };

      await axios.post(`${this.evoUrl}/instance/create`, payload, { headers: { apikey: this.evoKey } });
      this.logger.log(`Instância ${data.name} criada. A injetar o Proxy...`);

      // 2. Configurar o Proxy (SE EXISTIR) através da rota oficial da v2
      if (data.proxyHost && data.proxyPort) {
        const proxyPayload: any = {
          host: data.proxyHost,
          port: parseInt(data.proxyPort, 10),
          protocol: data.proxyProto || "http"
        };
        
        if (data.proxyUser && data.proxyPass) {
          proxyPayload.username = data.proxyUser;
          proxyPayload.password = data.proxyPass;
        }

        // Rota oficial da v2 para Set de Proxy
        await axios.post(`${this.evoUrl}/proxy/set/${data.name}`, proxyPayload, { headers: { apikey: this.evoKey } });
        this.logger.log(`[SUCESSO] Proxy ativado para a instância ${data.name}`);
      }

      // 3. Configurar Webhook
      if (this.webhookUrl) {
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
        }, { headers: { apikey: this.evoKey } });
        this.logger.log(`Webhook ativado para ${data.name}`);
      }

      // 4. Salvar no Banco de Dados
      return await this.prisma.instance.create({ 
        data: {
          name: data.name, 
          userId: data.userId,
          rejectCalls: data.rejectCalls || false, 
          ignoreGroups: data.ignoreGroups || false,
          proxyHost: data.proxyHost || null, 
          proxyPort: data.proxyPort || null, 
          proxyUser: data.proxyUser || null, 
          proxyPass: data.proxyPass || null, 
          proxyProto: data.proxyProto || 'http'
        } 
      });

    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message;
      this.logger.error(`Erro na criação da instância ou Proxy: ${msg}`);
      
      // Rollback: Apaga a instância "meio feita" na API caso a injeção do proxy ou webhook tenha falhado
      try { await axios.delete(`${this.evoUrl}/instance/delete/${data.name}`, { headers: { apikey: this.evoKey } }); } catch(e) {}
      
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
      // Como a instância foi criada sem qrcode:true, chamamos o connect agora para gerar.
      const res = await axios.get(`${this.evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: this.evoKey } });
      return res.data;
    } catch (e) { throw new HttpException('QR Indisponível', HttpStatus.BAD_REQUEST); }
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