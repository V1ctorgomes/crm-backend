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
  findAll() {
    return this.instancesService.findAll();
  }

  @Post()
  create(@Req() req: any, @Body() data: any) {
    return this.instancesService.create(req.user.userId, data);
  }

  // ROTA QUE FALTAVA PARA O BOTÃO "LER QR CODE" FUNCIONAR!
  @Get('connect/:name')
  getQrCode(@Req() req: any, @Param('name') name: string) {
    return this.instancesService.getQrCode(name);
  }

  @Put(':name/settings')
  updateSettings(@Req() req: any, @Param('name') name: string, @Body() data: any) {
    return this.instancesService.updateSettings(name, data);
  }

  @Delete(':name')
  remove(@Req() req: any, @Param('name') name: string, @Body() body?: { reason?: string }) {
    return this.instancesService.remove(name, actorFromReq(req), body?.reason);
  }
}