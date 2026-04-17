import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { InstancesService } from './instances.service';

@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.instancesService.findByUser(userId);
  }

  @Post()
  create(@Body() body: any) {
    return this.instancesService.create(body);
  }

  @Get(':name/qrcode')
  getQrCode(@Param('name') name: string) {
    return this.instancesService.getQrCode(name);
  }

  @Get(':name/status')
  checkStatus(@Param('name') name: string) {
    return this.instancesService.checkStatus(name);
  }

  @Put(':name')
  updateSettings(@Param('name') name: string, @Body() body: any) {
    return this.instancesService.updateSettings(name, body);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.instancesService.remove(name);
  }
}