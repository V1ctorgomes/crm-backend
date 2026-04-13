// src/whatsapp/whatsapp.controller.ts
import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable, map } from 'rxjs';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // Rota que o Frontend chama para ENVIAR mensagens
  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) {
    return this.whatsappService.sendText(body.number, body.text);
  }

  // Rota que a EVOLUTION API chama ao RECEBER mensagens
  @Post('webhook')
  handleWebhook(@Body() body: any) {
    this.whatsappService.processWebhook(body);
    return { received: true }; // Responde rápido à Evolution para não dar timeout
  }

  // Rota que o Frontend fica a ESCUTAR em tempo real (Server-Sent Events)
  @Sse('stream')
  streamMessages(): Observable<MessageEvent> {
    return this.whatsappService.messageStream$.pipe(
      map((data) => ({ data } as MessageEvent))
    );
  }
}