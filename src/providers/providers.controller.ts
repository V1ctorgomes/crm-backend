import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get(':name')
  @Roles('DEVELOPER')
  getProvider(@Param('name') name: string) {
    return this.providersService.getProvider(name);
  }

  @Post(':name')
  @Roles('DEVELOPER')
  upsertProvider(@Param('name') name: string, @Body() data: any) {
    return this.providersService.upsertProvider(name, data);
  }
}