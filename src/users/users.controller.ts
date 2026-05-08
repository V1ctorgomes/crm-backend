import { Controller, Get, Post, Put, Delete, Body, Param, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'USER', 'DEVELOPER')
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'DEVELOPER')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'DEVELOPER')
  create(@Body() body: any) {
    return this.usersService.create(body);
  }

  // Endpoint modificado para aceitar ficheiros (foto de perfil)
  @Put(':id')
  @UseInterceptors(FileInterceptor('file'))
  @Roles('ADMIN', 'DEVELOPER')
  update(@Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    return this.usersService.updateUser(id, body, file);
  }

  @Delete(':id')
  @Roles('ADMIN', 'DEVELOPER')
  delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}