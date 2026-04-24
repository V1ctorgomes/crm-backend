import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ProxiesService } from './proxies.service';

@Controller('proxies')
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