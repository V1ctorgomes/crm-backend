import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ProvidersService } from './providers.service';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get(':name')
  getProvider(@Param('name') name: string) {
    return this.providersService.getProvider(name);
  }

  @Post(':name')
  upsertProvider(@Param('name') name: string, @Body() data: any) {
    return this.providersService.upsertProvider(name, data);
  }
}