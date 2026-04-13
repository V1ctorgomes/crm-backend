// src/whatsapp/whatsapp.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { Subject } from 'rxjs';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  // Canal de eventos em tempo real para o Frontend
  private messageStream = new Subject<any>();
  get messageStream$() {
    return this.messageStream.asObservable();
  }

  // 1. ENVIAR MENSAGEM (O que já tínhamos)
  async sendText(number: string, text: string) {
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${this.apiUrl}/message/sendText/${this.instanceName}`;

    try {
      const response = await axios.post(
        endpoint,
        { number: cleanNumber, text: text, delay: 1000, linkPreview: true },
        { headers: { 'Content-Type': 'application/json', 'apikey': this.apiKey } }
      );
      return { success: true, messageId: response.data?.key?.id };
    } catch (error: any) {
      throw new HttpException(
        error.response?.data?.message || 'Falha ao enviar',
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // 2. RECEBER MENSAGEM (Processar o Webhook da Evolution API v2)
  processWebhook(payload: any) {
    // A Evolution API v2 envia o evento 'messages.upsert' quando há uma nova mensagem
    if (payload.event === 'messages.upsert' && payload.data) {
      const msgData = payload.data;
      
      // Ignorar mensagens que nós mesmos enviamos
      if (msgData.key.fromMe) return;

      // Extrair o texto (suporta texto simples ou resposta a outra mensagem)
      const text = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text;
      if (!text) return; // Ignora áudios/imagens por agora

      const senderNumber = msgData.key.remoteJid.replace('@s.whatsapp.net', '');
      const pushName = msgData.pushName || 'Cliente';

      this.logger.log(`Nova mensagem recebida de ${pushName} (${senderNumber})`);

      // Transmite a mensagem para o Frontend conectado
      this.messageStream.next({
        id: msgData.key.id,
        text: text,
        from: senderNumber,
        pushName: pushName,
        type: 'received',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  }
}