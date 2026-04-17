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
      await axios.post(`${this.evoUrl}/instance/create`, {
        instanceName: data.name, qrcode: true, integration: "WHATSAPP-BAILEYS"
      }, { headers: { apikey: this.evoKey } });
    } catch (error: any) {
      if (!error?.response?.data?.message?.includes('already exists')) throw new HttpException('Erro Evolution API', HttpStatus.BAD_REQUEST);
    }

    if (this.webhookUrl) {
      try {
        await axios.post(`${this.evoUrl}/webhook/set/${data.name}`, {
          url: this.webhookUrl, webhookByEvents: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "CONNECTION_UPDATE"]
        }, { headers: { apikey: this.evoKey } });
      } catch (e) { this.logger.warn("Falha ao setar Webhook"); }
    }

    return await this.prisma.instance.create({ 
      data: {
        name: data.name, userId: data.userId,
        rejectCalls: data.rejectCalls || false, ignoreGroups: data.ignoreGroups || false,
        proxyHost: data.proxyHost, proxyPort: data.proxyPort, proxyUser: data.proxyUser, proxyPass: data.proxyPass, proxyProto: data.proxyProto
      } 
    });
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

  // 👉 A FUNÇÃO QUE FALTAVA ESTÁ AQUI:
  async updateSettings(instanceName: string, data: any) {
    try {
      await axios.post(`${this.evoUrl}/settings/set/${instanceName}`, {
        rejectCall: data.rejectCalls, groupsIgnore: data.ignoreGroups
      }, { headers: { apikey: this.evoKey } });

      return await this.prisma.instance.update({
        where: { name: instanceName },
        data: { rejectCalls: data.rejectCalls, ignoreGroups: data.ignoreGroups }
      });
    } catch (error: any) {
      throw new HttpException('Falha ao atualizar configurações na Evolution API.', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string) {
    try { await axios.delete(`${this.evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: this.evoKey } }); } catch (e) {}
    return this.prisma.instance.delete({ where: { name: instanceName } });
  }
}