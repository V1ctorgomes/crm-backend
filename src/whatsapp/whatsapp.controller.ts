import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  Param, 
  Sse, 
  MessageEvent, 
  HttpCode, 
  UploadedFile, 
  UseInterceptors, 
  BadRequestException 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappService } from './whatsapp.service';
import { R2Service } from './r2.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly r2Service: R2Service // Serviço da Cloudflare injetado
  ) {}

  @Post('send')
  async sendMessage(@Body() body: { number: string; text: string }) {
    if (!body.number || !body.text) throw new BadRequestException('Número e texto são obrigatórios.');
    return this.whatsappService.sendText(body.number, body.text);
  }

  @Post('send-media')
  @UseInterceptors(FileInterceptor('file')) // Intercepta o ficheiro vindo do frontend
  async sendMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('number') number: string,
    @Body('caption') caption: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum ficheiro enviado.');
    if (!number) throw new BadRequestException('O número do contacto é obrigatório.');
    
    // 1. Envia para o Cloudflare R2 passando o "number" para criar a pasta do cliente
    const publicUrl = await this.r2Service.uploadFile(file, number);

    // 2. Envia a URL para a Evolution API e guarda no Banco de Dados
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