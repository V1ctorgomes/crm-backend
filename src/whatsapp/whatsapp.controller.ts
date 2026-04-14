import { Controller, Post, Body, Get, Param, Sse, MessageEvent, HttpCode, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappService } from './whatsapp.service';
import { R2Service } from './r2.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import 'multer';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly r2Service: R2Service // Injetado o novo serviço da Cloudflare
  ) {}

  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) {
    return this.whatsappService.sendText(body.number, body.text);
  }

  @Post('send-media')
  @UseInterceptors(FileInterceptor('file')) // Intercepta o arquivo real vindo do frontend
  async sendMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('number') number: string,
    @Body('caption') caption: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    
    // 1. Envia para o Cloudflare R2 e pega a URL limpa
    const publicUrl = await this.r2Service.uploadFile(file);

    // 2. Envia a URL para a Evolution API e salva no Banco de Dados
    return this.whatsappService.sendMedia(
      number, 
      publicUrl, 
      file.originalname, 
      file.mimetype, 
      caption || ''
    );
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

  @Get('contacts')
  async getContacts() {
    return this.whatsappService.getContacts();
  }

  @Get('history/:number')
  async getHistory(@Param('number') number: string) {
    return this.whatsappService.getChatHistory(number);
  }
}