import { Controller, Post, Body, Get, Param, Sse, MessageEvent, HttpCode } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ==========================================
  // ROTAS DE CHAT AO VIVO
  // ==========================================
  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) {
    return this.whatsappService.sendText(body.number, body.text);
  }

  @Post('webhook')
  @HttpCode(200)
  receiveWebhook(@Body() body: any) {
    this.whatsappService.processWebhook(body);
    return { status: 'success' };
  }

  @Sse('stream')
  streamMessages(): Observable<MessageEvent> {
    return this.whatsappService.messageStream$.pipe(
      map((payload) => ({ data: payload.data }) as MessageEvent),
    );
  }

  // ==========================================
  // ROTAS DE BANCO DE DADOS (NOVAS)
  // ==========================================
  @Get('contacts')
  async getContacts() {
    return this.whatsappService.getContacts();
  }

  @Get('history/:number')
  async getHistory(@Param('number') number: string) {
    return this.whatsappService.getChatHistory(number);
  }
}