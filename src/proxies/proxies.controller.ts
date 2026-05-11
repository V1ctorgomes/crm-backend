import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { ProxiesService } from './proxies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('proxies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProxiesController {
  constructor(private readonly proxiesService: ProxiesService) {}

  @Post()
  @Roles('DEVELOPER')
  create(@Body() createProxyDto: any) {
    return this.proxiesService.create(createProxyDto);
  }

  @Get()
  findAll() {
    return this.proxiesService.findAll();
  }

  @Delete(':id')
  @Roles('DEVELOPER')
  remove(@Param('id') id: string) {
    return this.proxiesService.remove(id);
  }
}