import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('instances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Get('user/:userId')
  @Roles('ADMIN', 'USER')
  findByUser(@Param('userId') userId: string) {
    return this.instancesService.findByUser(userId);
  }

  @Post()
  @Roles('ADMIN', 'USER')
  create(@Body() data: any) {
    return this.instancesService.create(data);
  }

  // ROTA QUE FALTAVA PARA O BOTÃO "LER QR CODE" FUNCIONAR!
  @Get('connect/:name')
  @Roles('ADMIN', 'USER')
  getQrCode(@Param('name') name: string) {
    return this.instancesService.getQrCode(name);
  }

  @Put(':name/settings')
  @Roles('ADMIN', 'USER')
  updateSettings(@Param('name') name: string, @Body() data: any) {
    return this.instancesService.updateSettings(name, data);
  }

  @Delete(':name')
  @Roles('ADMIN', 'USER')
  remove(@Param('name') name: string) {
    return this.instancesService.remove(name);
  }
}