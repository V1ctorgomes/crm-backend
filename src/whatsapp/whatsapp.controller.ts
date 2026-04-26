import { Controller, Get, Post, Put, Delete, Body, Param, Sse, MessageEvent, UseInterceptors, UploadedFile } from '@nestjs/common';
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
  async sendMessage(@Body() body: { number: string; text: string; instanceName?: string }) { 
    return this.whatsappService.sendText(body.number, body.text, body.instanceName); 
  }

  @Post('send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendMedia(
    @UploadedFile() file: any, 
    @Body() body: { number: string; caption: string; instanceName?: string }
  ) {
    return this.whatsappService.sendMedia(body.number, file, body.caption || '', body.instanceName);
  }

  @Put('contacts/:number')
  async updateContact(@Param('number') number: string, @Body() data: any) {
    return this.whatsappService.updateContact(number, data);
  }

  @Delete('contacts/:number')
  async removeContact(@Param('number') number: string) {
    return this.whatsappService.removeContact(number);
  }
}