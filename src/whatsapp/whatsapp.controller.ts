import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Sse,
  MessageEvent,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UnauthorizedException,
  Query,
  Headers,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-crm-webhook-secret') secretHeader?: string,
    @Query('token') tokenQuery?: string,
  ) {
    const expected = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
    if (expected) {
      const ok = secretHeader === expected || tokenQuery === expected;
      if (!ok) {
        throw new UnauthorizedException('Webhook não autorizado.');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        'Defina WHATSAPP_WEBHOOK_SECRET no servidor e use ?token=… na URL do webhook ou o header x-crm-webhook-secret.',
      );
    }
    return this.whatsappService.processWebhook(payload);
  }

  @Sse('stream')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER', 'DEVELOPER')
  stream(@Req() req: any): Observable<MessageEvent> {
    const userId = req.user.userId as string;
    return this.whatsappService.messageStream$.pipe(
      filter((payload: any) => payload?._crmUserId === userId),
      map((payload: any) => {
        if (!payload || typeof payload !== 'object') {
          return { data: '{}' } as MessageEvent;
        }
        const { _crmUserId: _removed, ...rest } = payload;
        return { data: JSON.stringify(rest) } as MessageEvent;
      }),
    );
  }

  @Get('contacts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async getContacts(@Req() req: any) { 
    return this.whatsappService.getContacts(req.user.userId); 
  }

  @Get('history/:number')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async getChatHistory(
    @Req() req: any,
    @Param('number') number: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeMessageId?: string,
  ) {
    const parsed = limitStr !== undefined && limitStr !== '' ? parseInt(limitStr, 10) : NaN;
    const limit = Number.isFinite(parsed) ? parsed : undefined;
    return this.whatsappService.getChatHistory(req.user.userId, number, {
      limit,
      beforeMessageId: beforeMessageId?.trim() || undefined,
    });
  }

  @Delete('history/:number')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async deleteConversation(@Req() req: any, @Param('number') number: string) { 
    return this.whatsappService.deleteConversation(req.user.userId, number); 
  }

  @Post('groups/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async createGroup(
    @Req() req: any,
    @Body() body: { subject: string; participants: string[]; description?: string; instanceName?: string },
  ) {
    return this.whatsappService.createGroup(req.user.userId, body);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async sendMessage(@Req() req: any, @Body() body: { number: string; text: string; instanceName?: string }) { 
    return this.whatsappService.sendText(req.user.userId, body.number, body.text, body.instanceName); 
  }

  @Post('messages/delete-for-everyone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async deleteMessageForEveryone(
    @Req() req: any,
    @Body() body: { contactNumber: string; messageId: string; instanceName?: string },
  ) {
    return this.whatsappService.deleteMessageForEveryone(req.user.userId, body);
  }

  @Post('messages/update-text')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async updateMessageText(
    @Req() req: any,
    @Body() body: { contactNumber: string; messageId: string; text: string; instanceName?: string },
  ) {
    return this.whatsappService.updateMessageText(req.user.userId, body);
  }

  @Post('send-media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async sendMedia(
    @Req() req: any,
    @UploadedFile() file: any, 
    @Body() body: { number: string; caption: string; instanceName?: string }
  ) {
    return this.whatsappService.sendMedia(req.user.userId, body.number, file, body.caption || '', body.instanceName);
  }

  @Put('contacts/:number')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async updateContact(@Req() req: any, @Param('number') number: string, @Body() data: any) {
    return this.whatsappService.updateContact(req.user.userId, number, data);
  }

  @Delete('contacts/:number')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async removeContact(@Req() req: any, @Param('number') number: string) {
    return this.whatsappService.removeContact(req.user.userId, number);
  }
}