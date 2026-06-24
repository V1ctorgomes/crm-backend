import { Controller, Get, Post, Put, Delete, Body, Param, Req, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { parseBoundedInt } from '../common/parse-bounded-int';
import { WhatsappService } from './whatsapp.service';
import { whatsappActorFromReq } from './whatsapp-controller.util';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class WhatsappContactsController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('contacts')
  getContacts(@Req() req: any) {
    return this.whatsappService.getContacts(req.user.userId);
  }

  @Get('history/:number')
  getChatHistory(
    @Req() req: any,
    @Param('number') number: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeMessageId?: string,
  ) {
    const limit =
      limitStr !== undefined && limitStr !== '' ? parseBoundedInt(limitStr, 50, 1, 200) : undefined;
    return this.whatsappService.getChatHistory(req.user.userId, number, {
      limit,
      beforeMessageId: beforeMessageId?.trim() || undefined,
    });
  }

  @Delete('history/:number')
  deleteConversation(@Req() req: any, @Param('number') number: string, @Body() body?: { reason?: string }) {
    return this.whatsappService.deleteConversation(req.user.userId, number, whatsappActorFromReq(req), body?.reason);
  }

  @Post('groups/create')
  createGroup(
    @Req() req: any,
    @Body() body: { subject: string; participants: string[]; description?: string; instanceName?: string },
  ) {
    return this.whatsappService.createGroup(req.user.userId, body);
  }

  @Post('groups/sync-profile')
  syncGroupProfile(@Req() req: any, @Body() body: { number: string; instanceName?: string }) {
    return this.whatsappService.syncGroupProfileFromWhatsApp(req.user.userId, body);
  }

  @Get('instances-health')
  getInstancesHealth(@Req() req: any) {
    return this.whatsappService.getInstancesHealthForUser(req.user.userId);
  }

  @Put('contacts/:number')
  updateContact(@Req() req: any, @Param('number') number: string, @Body() data: any) {
    return this.whatsappService.updateContact(req.user.userId, number, data);
  }

  @Delete('contacts/:number')
  removeContact(@Req() req: any, @Param('number') number: string, @Body() body?: { reason?: string }) {
    return this.whatsappService.removeContact(req.user.userId, number, whatsappActorFromReq(req), body?.reason);
  }
}
