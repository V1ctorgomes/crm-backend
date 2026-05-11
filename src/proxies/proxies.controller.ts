import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { ProxiesService } from './proxies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('proxies')
@UseGuards(JwtAuthGuard)
export class ProxiesController {
  constructor(private readonly proxiesService: ProxiesService) {}

  @Post()
  create(@Body() createProxyDto: any) {
    return this.proxiesService.create(createProxyDto);
  }

  @Get()
  findAll() {
    return this.proxiesService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.proxiesService.remove(id);
  }
}