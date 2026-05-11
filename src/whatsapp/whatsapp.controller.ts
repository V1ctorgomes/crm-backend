import { Controller, Get, Post, Put, Delete, Body, Param, Req, Sse, MessageEvent, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    return this.whatsappService.processWebhook(payload);
  }

  @Sse('stream')
  // Nota: EventSource não consegue enviar headers Authorization facilmente.
  // Por enquanto, mantemos o stream público para não quebrar o frontend.
  stream(): Observable<MessageEvent> {
    return this.whatsappService.messageStream$.pipe(
      map((data) => ({ data } as MessageEvent)),
    );
  }

  @Get('contacts')
  @UseGuards(JwtAuthGuard)
  async getContacts(@Req() req: any) { 
    return this.whatsappService.getContacts(req.user.userId); 
  }

  @Get('history/:number')
  @UseGuards(JwtAuthGuard)
  async getChatHistory(@Req() req: any, @Param('number') number: string) { 
    return this.whatsappService.getChatHistory(req.user.userId, number); 
  }

  @Delete('history/:number')
  @UseGuards(JwtAuthGuard)
  async deleteConversation(@Req() req: any, @Param('number') number: string) { 
    return this.whatsappService.deleteConversation(req.user.userId, number); 
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Req() req: any, @Body() body: { number: string; text: string; instanceName?: string }) { 
    return this.whatsappService.sendText(req.user.userId, body.number, body.text, body.instanceName); 
  }

  @Post('send-media')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async sendMedia(
    @Req() req: any,
    @UploadedFile() file: any, 
    @Body() body: { number: string; caption: string; instanceName?: string }
  ) {
    return this.whatsappService.sendMedia(req.user.userId, body.number, file, body.caption || '', body.instanceName);
  }

  @Put('contacts/:number')
  @UseGuards(JwtAuthGuard)
  async updateContact(@Req() req: any, @Param('number') number: string, @Body() data: any) {
    return this.whatsappService.updateContact(req.user.userId, number, data);
  }

  @Delete('contacts/:number')
  @UseGuards(JwtAuthGuard)
  async removeContact(@Req() req: any, @Param('number') number: string) {
    return this.whatsappService.removeContact(req.user.userId, number);
  }
}