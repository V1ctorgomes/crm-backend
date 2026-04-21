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
      // 1. Criar a Instância
      await axios.post(`${this.evoUrl}/instance/create`, {
        instanceName: data.name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      }, { headers: { apikey: this.evoKey } });

      this.logger.log(`Instância ${data.name} criada. Aguardando para configurar webhook...`);

      // 2. Pequena espera (2 segundos) para a Evolution processar a criação
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Configurar Webhook (Formato exato Evolution v2)
      if (this.webhookUrl) {
        await axios.post(`${this.evoUrl}/webhook/set/${data.name}`, {
          webhook: {
            enabled: true,
            url: this.webhookUrl,
            byEvents: false, // Na v2 mudou de webhookByEvents para byEvents
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

      // 4. Salvar no Banco
      return await this.prisma.instance.create({ 
        data: {
          name: data.name, userId: data.userId,
          rejectCalls: data.rejectCalls || false, ignoreGroups: data.ignoreGroups || false,
          proxyHost: data.proxyHost, proxyPort: data.proxyPort, proxyUser: data.proxyUser, proxyPass: data.proxyPass, proxyProto: data.proxyProto
        } 
      });

    } catch (error: any) {
      const msg = error?.response?.data?.message || error.message;
      this.logger.error(`Erro na criação/webhook: ${msg}`);
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