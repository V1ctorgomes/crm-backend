import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushNotificationsService } from './push-notifications.service';
import type { PushSubscribeBody } from './push-notifications.service';

@Controller('notifications/push')
export class PushNotificationsController {
  constructor(private readonly pushService: PushNotificationsService) {}

  /** Chave pública para o browser subscrever (sem JWT). */
  @Get('vapid-public-key')
  vapidPublicKey() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? '',
    };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(
    @Req() req: { user: { userId: string } },
    @Body() body: PushSubscribeBody,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (
      !body?.endpoint ||
      !body?.keys?.p256dh ||
      !body?.keys?.auth ||
      typeof body.endpoint !== 'string'
    ) {
      throw new BadRequestException('Subscrição push inválida.');
    }
    await this.pushService.saveSubscription(req.user.userId, body, userAgent);
    return { ok: true };
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(
    @Req() req: { user: { userId: string } },
    @Body() body: { endpoint?: string },
  ) {
    if (body?.endpoint) {
      await this.pushService.removeByEndpoint(req.user.userId, body.endpoint);
    } else {
      await this.pushService.removeAllForUser(req.user.userId);
    }
    return { ok: true };
  }
}
