// src/whatsapp/whatsapp.controller.ts
import { Controller, Post, Body, Sse, MessageEvent, HttpCode } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // 1. Porta de Envio (Frontend -> Backend -> Evolution)
  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) {
    return this.whatsappService.sendText(body.number, body.text);
  }

  // 2. Porta do Webhook (Evolution -> Backend)
  @Post('webhook')
  @HttpCode(200) // Importante: A Evolution exige que o Webhook retorne 200 OK rápido
  receiveWebhook(@Body() body: any) {
    // Processa a mensagem em segundo plano para não travar a Evolution
    this.whatsappService.processWebhook(body);
    return { status: 'success', message: 'Webhook recebido' };
  }

  // 3. Porta do Streaming ao Vivo (Backend -> Frontend)
  @Sse('stream')
  streamMessages(): Observable<MessageEvent> {
    return this.whatsappService.messageStream$.pipe(
      map((payload) => ({
        data: payload.data, // Envia o formato exato que o EventSource do Next.js espera
      }) as MessageEvent),
    );
  }
}