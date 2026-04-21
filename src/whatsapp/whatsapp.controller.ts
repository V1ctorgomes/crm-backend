import { Controller, Get, Post, Body, Param, Delete, Sse, MessageEvent, UseInterceptors, UploadedFile } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    return this.whatsappService.processWebhook(payload);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.whatsappService.messageStream$.pipe(
      map((data) => ({ data } as MessageEvent)),
    );
  }

  @Get('contacts')
  async getContacts() { 
    return this.whatsappService.getContacts(); 
  }

  @Get('history/:number')
  async getChatHistory(@Param('number') number: string) { 
    return this.whatsappService.getChatHistory(number); 
  }

  @Delete('history/:number')
  async deleteConversation(@Param('number') number: string) { 
    return this.whatsappService.deleteConversation(number); 
  }

  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) { 
    return this.whatsappService.sendText(body.number, body.text); 
  }

  // 👉 ROTA RESTAURADA PARA ENVIO DE DOCUMENTOS/MÍDIA PARA A CLOUDFLARE E WHATSAPP
  @Post('send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendMedia(
    @UploadedFile() file: any, 
    @Body() body: { number: string; caption: string }
  ) {
    return this.whatsappService.sendMedia(body.number, file, body.caption || '');
  }
}