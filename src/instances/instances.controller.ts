import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

function actorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

@Controller('instances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Get('user/:userId')
  findAll(@Req() req: { user: { userId: string } }, @Param('userId') userId: string) {
    return this.instancesService.findAllForUser(req.user.userId, userId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() data: Record<string, unknown>) {
    return this.instancesService.create(req.user.userId, data);
  }

  @Get('connect/:name')
  getQrCode(@Req() req: { user: { userId: string } }, @Param('name') name: string) {
    return this.instancesService.getQrCode(req.user.userId, name);
  }

  @Put(':name/settings')
  updateSettings(
    @Req() req: { user: { userId: string } },
    @Param('name') name: string,
    @Body() data: Record<string, unknown>,
  ) {
    return this.instancesService.updateSettings(req.user.userId, name, data);
  }

  @Post('sync-webhooks')
  @Roles('ADMIN', 'DEVELOPER')
  syncWebhooks(@Req() req: { user: { role: string } }) {
    return this.instancesService.syncAllWebhooks(req.user.role);
  }

  @Delete(':name')
  remove(@Req() req: any, @Param('name') name: string, @Body() body?: { reason?: string }) {
    return this.instancesService.remove(name, actorFromReq(req), body?.reason);
  }
}
