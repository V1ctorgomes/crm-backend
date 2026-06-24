import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { assertCrmUpload } from '../common/upload-media.validation';
import { WhatsappService } from './whatsapp.service';
import { whatsappActorFromReq } from './whatsapp-controller.util';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class WhatsappMessagingController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  sendMessage(@Req() req: any, @Body() body: { number: string; text: string; instanceName?: string }) {
    return this.whatsappService.sendText(req.user.userId, body.number, body.text, body.instanceName);
  }

  @Post('presence')
  @Throttle({ default: { limit: 45, ttl: 60_000 } })
  sendPresence(
    @Req() req: any,
    @Body() body: { number: string; presence: 'composing' | 'recording'; instanceName?: string },
  ) {
    return this.whatsappService.sendChatPresence(
      req.user.userId,
      body.number,
      body.presence,
      body.instanceName,
    );
  }

  @Post('messages/delete-for-everyone')
  deleteMessageForEveryone(
    @Req() req: any,
    @Body() body: { contactNumber: string; messageId: string; instanceName?: string; reason?: string },
  ) {
    return this.whatsappService.deleteMessageForEveryone(req.user.userId, body, whatsappActorFromReq(req));
  }

  @Post('messages/update-text')
  updateMessageText(
    @Req() req: any,
    @Body() body: { contactNumber: string; messageId: string; text: string; instanceName?: string },
  ) {
    return this.whatsappService.updateMessageText(req.user.userId, body);
  }

  @Post('send-media')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  sendMedia(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: { number: string; caption: string; instanceName?: string },
  ) {
    assertCrmUpload(file, 'Mídia');
    return this.whatsappService.sendMedia(req.user.userId, body.number, file, body.caption || '', body.instanceName);
  }
}
