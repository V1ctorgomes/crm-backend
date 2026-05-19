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
import { assertWebhookAuthorized } from '../common/webhook-auth';
import { assertCrmUpload } from '../common/upload-media.validation';
import { parseBoundedInt } from '../common/parse-bounded-int';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

function actorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /** Evolution: autenticação por segredo; rate limit no middleware Express. */
  @Post('webhook')
  async handleWebhook(
    @Body() payload: unknown,
    @Headers('x-crm-webhook-secret') secretHeader?: string,
    @Query('token') tokenQuery?: string,
  ) {
    assertWebhookAuthorized(secretHeader, tokenQuery);
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Payload inválido.');
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
    const limit =
      limitStr !== undefined && limitStr !== ''
        ? parseBoundedInt(limitStr, 50, 1, 200)
        : undefined;
    return this.whatsappService.getChatHistory(req.user.userId, number, {
      limit,
      beforeMessageId: beforeMessageId?.trim() || undefined,
    });
  }

  @Delete('history/:number')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async deleteConversation(@Req() req: any, @Param('number') number: string, @Body() body?: { reason?: string }) {
    return this.whatsappService.deleteConversation(req.user.userId, number, actorFromReq(req), body?.reason);
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

  @Post('groups/sync-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER')
  async syncGroupProfile(
    @Req() req: any,
    @Body() body: { number: string; instanceName?: string },
  ) {
    return this.whatsappService.syncGroupProfileFromWhatsApp(req.user.userId, body);
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
    @Body() body: { contactNumber: string; messageId: string; instanceName?: string; reason?: string },
  ) {
    return this.whatsappService.deleteMessageForEveryone(req.user.userId, body, actorFromReq(req));
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
    assertCrmUpload(file, 'Mídia');
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
  async removeContact(@Req() req: any, @Param('number') number: string, @Body() body?: { reason?: string }) {
    return this.whatsappService.removeContact(req.user.userId, number, actorFromReq(req), body?.reason);
  }
}