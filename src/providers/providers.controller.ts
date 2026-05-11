import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DEVELOPER')
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