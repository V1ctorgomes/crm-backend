import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('instances')
@UseGuards(JwtAuthGuard)
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.instancesService.findByUser(userId);
  }

  @Post()
  create(@Body() data: any) {
    return this.instancesService.create(data);
  }

  // ROTA QUE FALTAVA PARA O BOTÃO "LER QR CODE" FUNCIONAR!
  @Get('connect/:name')
  getQrCode(@Param('name') name: string) {
    return this.instancesService.getQrCode(name);
  }

  @Put(':name/settings')
  updateSettings(@Param('name') name: string, @Body() data: any) {
    return this.instancesService.updateSettings(name, data);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.instancesService.remove(name);
  }
}