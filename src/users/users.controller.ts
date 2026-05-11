import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.usersService.findAll(req.user.userId, req.user.role);
  }

  @Get('me')
  findMe(@Req() req: any) {
    return this.usersService.findMe(req.user.userId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.usersService.findOne(req.user.userId, req.user.role, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.usersService.create(req.user.userId, req.user.role, body);
  }

  // Endpoint modificado para aceitar ficheiros (foto de perfil)
  @Put(':id')
  @UseInterceptors(FileInterceptor('file'))
  update(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    return this.usersService.updateUser(req.user.userId, req.user.role, id, body, file);
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) {
    return this.usersService.delete(req.user.userId, req.user.role, id);
  }
}