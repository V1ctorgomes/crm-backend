import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);
  private readonly evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly evoKey = process.env.EVOLUTION_API_KEY;

  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) {
    // Busca e atualiza o status de todas as instâncias em tempo real
    const instances = await this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    for (const inst of instances) {
      await this.checkStatus(inst.name);
    }
    return this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(data: any) {
    try {
      // 1. Cria na Evolution API V2
      await axios.post(`${this.evoUrl}/instance/create`, {
        instanceName: data.name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      }, { headers: { apikey: this.evoKey } });

      // 2. Aplica Proxy se existir
      if (data.proxyHost && data.proxyPort) {
        await axios.post(`${this.evoUrl}/instance/setProxy/${data.name}`, {
          host: data.proxyHost, port: Number(data.proxyPort), protocol: data.proxyProto || 'http', username: data.proxyUser, password: data.proxyPass
        }, { headers: { apikey: this.evoKey } });
      }

      // 3. Aplica Settings (Rejeitar Chamadas, Ignorar Grupos)
      await axios.post(`${this.evoUrl}/settings/set/${data.name}`, {
        rejectCall: data.rejectCalls, groupsIgnore: data.ignoreGroups, readMessages: false, readStatus: false
      }, { headers: { apikey: this.evoKey } });

      // 4. Salva no Banco de Dados atrelado ao Usuário
      return await this.prisma.instance.create({ data });
    } catch (error: any) {
      this.logger.error("Erro ao criar instância na Evolution", error?.response?.data || error.message);
      throw new HttpException(error?.response?.data?.message || 'Falha ao criar instância', HttpStatus.BAD_REQUEST);
    }
  }

  async getQrCode(instanceName: string) {
    try {
      const res = await axios.get(`${this.evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: this.evoKey } });
      return res.data; // Retorna o Base64
    } catch (error: any) {
      throw new HttpException('QR Code não disponível ou já conectado', HttpStatus.BAD_REQUEST);
    }
  }

  async checkStatus(instanceName: string) {
    try {
      const res = await axios.get(`${this.evoUrl}/instance/connectionState/${instanceName}`, { headers: { apikey: this.evoKey } });
      const state = res.data?.instance?.state || 'disconnected';
      let status = 'disconnected';
      if (state === 'open') status = 'connected';
      else if (state === 'connecting') status = 'connecting';

      await this.prisma.instance.updateMany({
        where: { name: instanceName },
        data: { status }
      });
      return { status };
    } catch (error) {
      await this.prisma.instance.updateMany({ where: { name: instanceName }, data: { status: 'disconnected' } });
      return { status: 'disconnected' };
    }
  }

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
      throw new HttpException('Falha ao atualizar configurações', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string) {
    try {
      // Deleta da Evolution (E faz logout do WhatsApp)
      await axios.delete(`${this.evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: this.evoKey } });
    } catch (e) { /* Ignora se já não existir lá */ }
    
    return this.prisma.instance.delete({ where: { name: instanceName } });
  }
}