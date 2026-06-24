import { Controller, Post, Sse, MessageEvent, Body, Headers, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UseGuards } from '@nestjs/common';
import { assertWebhookAuthorized } from '../common/webhook-auth';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly whatsappService: WhatsappService) {}

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
}
