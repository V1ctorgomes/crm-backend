import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);
  
  // O webhookUrl mantém-se no .env pois é o endereço do próprio CRM
  private readonly webhookUrl = process.env.WEBHOOK_URL; 

  constructor(private prisma: PrismaService) {}

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
      for (const inst of instances) {
        await this.checkStatus(inst.name);
      }
    } catch (e) {
      this.logger.warn('Não foi possível verificar o status das instâncias. Verifique as credenciais da API.');
    }
    
    return this.prisma.instance.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(data: any) {
    // 1. Vai buscar as credenciais atualizadas à BD
    const { evoUrl, evoKey } = await this.getEvolutionCredentials();

    try {
      const payload: any = {
        instanceName: data.name,
        qrcode: false, 
        integration: "WHATSAPP-BAILEYS"
      };

      // 2. Disparar pedido de criação para a Evolution
      await axios.post(`${evoUrl}/instance/create`, payload, { headers: { apikey: evoKey } });
      this.logger.log(`Instância ${data.name} criada com sucesso na Evolution API v2.`);

      // 3. Forçar a configuração do Proxy através do endpoint dedicado
      if (data.proxyHost && data.proxyPort) {
        const proxySetPayload: any = {
          enabled: true,
          host: String(data.proxyHost).trim(),
          port: String(data.proxyPort), 
          protocol: String(data.proxyProto || "http").toLowerCase().trim()
        };

        if (data.proxyUser && data.proxyPass) {
          proxySetPayload.username = String(data.proxyUser).trim();
          proxySetPayload.password = String(data.proxyPass).trim();
        }

        try {
          await axios.post(`${evoUrl}/proxy/set/${data.name}`, proxySetPayload, { 
            headers: { 'Content-Type': 'application/json', apikey: evoKey } 
          });
          this.logger.log(`Proxy configurado com sucesso para a instância ${data.name}`);
        } catch (proxyErr: any) {
          await axios.delete(`${evoUrl}/instance/delete/${data.name}`, { headers: { apikey: evoKey } }).catch(() => {});
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
      if (this.webhookUrl) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await axios.post(`${evoUrl}/webhook/set/${data.name}`, {
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
        }, { headers: { apikey: evoKey } }).catch(e => this.logger.warn(`Erro no webhook (ignorado): ${e.message}`));
      }

      // 5. Salvar no Banco de Dados
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

  async getQrCode(instanceName: string) {
    try {
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      return res.data;
    } catch (error: any) { 
      const msg = error?.response?.data?.message || "Serviço Indisponível ou Credenciais Inválidas";
      throw new HttpException(msg, HttpStatus.BAD_REQUEST); 
    }
  }

  async updateSettings(instanceName: string, data: any) {
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

  async remove(instanceName: string) {
    try { 
      const { evoUrl, evoKey } = await this.getEvolutionCredentials();
      await axios.delete(`${evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: evoKey } }); 
    } catch (e) {
      this.logger.warn(`Instância ${instanceName} não pôde ser apagada na Evolution (Pode já não existir).`);
    }
    return this.prisma.instance.delete({ where: { name: instanceName } });
  }
}