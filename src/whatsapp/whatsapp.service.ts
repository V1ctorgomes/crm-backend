import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs'; // <-- IMPORTANTE: Biblioteca para o stream de mensagens

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  // ====================================================================
  // 1. SISTEMA DE RECEBIMENTO (WEBHOOKS E SSE)
  // Resolve os erros: 'messageStream$' e 'processWebhook'
  // ====================================================================
  
  // Cria um "canal" de transmissão contínua para o Frontend
  private messageSubject = new Subject<any>();
  
  // Expõe esse canal para o Controller (SSE)
  public readonly messageStream$ = this.messageSubject.asObservable();

  // Função chamada pelo Controller quando a Evolution API manda uma mensagem
  processWebhook(payload: any) {
    this.logger.log('📥 Novo evento recebido da Evolution API');
    
    // Repassa a mensagem para o Frontend. O NestJS exige o formato { data: ... }
    this.messageSubject.next({ data: payload });
  }

  // ====================================================================
  // 2. SISTEMA DE ENVIO (Já estava pronto)
  // ====================================================================

  async sendText(number: string, text: string) {
    if (!this.apiUrl || !this.apiKey || !this.instanceName) {
      this.logger.error('Variáveis de ambiente da Evolution API em falta!');
      throw new HttpException('Configuração incompleta', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendText/${this.instanceName}`;

    try {
      this.logger.log(`Enviando mensagem para: ${cleanNumber}`);
      
      const response = await axios.post(
        endpoint,
        {
          number: cleanNumber,
          text: text,
          delay: 1500,
          linkPreview: true
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
      this.logger.error(`Falha no envio: ${error.response?.data?.message || error.message}`);
      
      throw new HttpException(
        error.response?.data?.message || 'Falha ao comunicar com a Evolution',
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }
}