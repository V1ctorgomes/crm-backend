import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('instances')
@UseGuards(JwtAuthGuard)
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Get('user/:userId')
  findByUser(@Req() req: any) {
    return this.instancesService.findByUser(req.user.userId);
  }

  @Post()
  create(@Req() req: any, @Body() data: any) {
    return this.instancesService.create(req.user.userId, data);
  }

  // ROTA QUE FALTAVA PARA O BOTÃO "LER QR CODE" FUNCIONAR!
  @Get('connect/:name')
  getQrCode(@Req() req: any, @Param('name') name: string) {
    return this.instancesService.getQrCode(req.user.userId, name);
  }

  @Put(':name/settings')
  updateSettings(@Req() req: any, @Param('name') name: string, @Body() data: any) {
    return this.instancesService.updateSettings(req.user.userId, name, data);
  }

  @Delete(':name')
  remove(@Req() req: any, @Param('name') name: string) {
    return this.instancesService.remove(req.user.userId, name);
  }
}