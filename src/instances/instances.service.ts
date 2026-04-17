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
    const instances = await this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    for (const inst of instances) {
      await this.checkStatus(inst.name);
    }
    return this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(data: any) {
    // 1. Validação de Segurança Básica
    if (!this.evoUrl || !this.evoKey) {
      throw new HttpException('A URL ou a Chave da Evolution API não estão configuradas no .env do servidor.', HttpStatus.BAD_REQUEST);
    }
    if (!data.name || !data.userId) {
      throw new HttpException('Nome da instância e Usuário são obrigatórios.', HttpStatus.BAD_REQUEST);
    }

    // 2. Tenta Criar na Evolution API
    try {
      await axios.post(`${this.evoUrl}/instance/create`, {
        instanceName: data.name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      }, { headers: { apikey: this.evoKey } });
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error.message;
      this.logger.error(`Erro ao criar na Evolution: ${errorMessage}`);
      
      // Se a instância já existir na Evolution, ignoramos o erro e avançamos para salvar no nosso banco.
      if (!String(errorMessage).toLowerCase().includes('already exists')) {
        throw new HttpException(`Erro na Evolution API: ${errorMessage}`, HttpStatus.BAD_REQUEST);
      }
    }

    // 3. Tenta Aplicar Configurações (Settings)
    try {
      await axios.post(`${this.evoUrl}/settings/set/${data.name}`, {
        rejectCall: data.rejectCalls || false, 
        groupsIgnore: data.ignoreGroups || false, 
        readMessages: false, 
        readStatus: false
      }, { headers: { apikey: this.evoKey } });
    } catch (error: any) {
      // Usamos apenas um aviso (Warning) para não impedir a criação da instância se as configurações falharem
      this.logger.warn(`Aviso: Não foi possível definir as configurações (Settings) para ${data.name}.`);
    }

    // 4. Salva no Banco de Dados
    try {
      return await this.prisma.instance.create({ 
        data: {
          name: data.name,
          userId: data.userId,
          rejectCalls: data.rejectCalls || false,
          ignoreGroups: data.ignoreGroups || false,
          proxyHost: data.proxyHost,
          proxyPort: data.proxyPort,
          proxyUser: data.proxyUser,
          proxyPass: data.proxyPass,
          proxyProto: data.proxyProto
        } 
      });
    } catch (dbError: any) {
      this.logger.error("Erro ao salvar no banco (Prisma)", dbError);
      throw new HttpException('A instância foi criada na Evolution, mas falhou ao salvar no banco de dados.', HttpStatus.BAD_REQUEST);
    }
  }

  async getQrCode(instanceName: string) {
    try {
      const res = await axios.get(`${this.evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: this.evoKey } });
      return res.data;
    } catch (error: any) {
      throw new HttpException('QR Code indisponível. A instância já pode estar conectada.', HttpStatus.BAD_REQUEST);
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
      throw new HttpException('Falha ao atualizar configurações na Evolution API.', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string) {
    try {
      await axios.delete(`${this.evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: this.evoKey } });
    } catch (e) { 
      this.logger.warn(`A instância ${instanceName} já não existia na Evolution API ou falhou ao apagar.`);
    }
    
    return this.prisma.instance.delete({ where: { name: instanceName } });
  }
}