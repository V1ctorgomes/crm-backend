import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    return this.whatsappService.processWebhook(payload);
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
}