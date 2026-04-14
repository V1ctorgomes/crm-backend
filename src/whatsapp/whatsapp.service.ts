// src/whatsapp/whatsapp.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  // Limpa as barras invertidas no final da URL
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  // ==========================================
  // CANAL DE STREAMING (SSE)
  // ==========================================
  // Cria um "tubo" por onde as mensagens vão fluir para o Frontend
  private messageSubject = new Subject<any>();
  public readonly messageStream$ = this.messageSubject.asObservable();

  // Função que recebe a mensagem do Webhook e atira para o Frontend
  processWebhook(payload: any) {
    this.logger.log('📥 Nova atividade recebida do Webhook da Evolution API');
    this.messageSubject.next({ data: payload });
  }

  // ==========================================
  // FUNÇÃO DE ENVIO
  // ==========================================
  async sendText(number: string, text: string) {
    if (!this.apiUrl || !this.apiKey || !this.instanceName) {
      throw new HttpException('Variáveis da Evolution API ausentes no .env', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Remove espaços, traços e parênteses (deixa só os números)
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendText/${this.instanceName}`;

    try {
      this.logger.log(`Enviando mensagem para: ${cleanNumber}`);
      
      const response = await axios.post(
        endpoint,
        {
          number: cleanNumber,
          text: text
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
          },
        }
      );

      return { success: true, messageId: response.data?.key?.id || 'enviado' };
    } catch (error: any) {
      const erroExato = error.response?.data || error.message;
      this.logger.error(`❌ FALHA NA EVOLUTION API:`, erroExato);
      
      throw new HttpException(
        error.response?.data?.message || 'Falha ao comunicar com a Evolution',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }
}