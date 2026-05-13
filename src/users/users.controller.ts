import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  findPending(@Req() req: any) {
    return this.usersService.findPending(req.user.role);
  }

  @Post('pending/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  approvePending(@Req() req: any, @Param('id') id: string) {
    return this.usersService.approvePending(req.user.role, id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
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
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  create(@Req() req: any, @Body() body: any) {
    return this.usersService.create(req.user.userId, req.user.role, body);
  }

  // Endpoint modificado para aceitar ficheiros (foto de perfil)
  @Put(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  update(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    return this.usersService.updateUser(req.user.userId, req.user.role, id, body, file);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  delete(@Req() req: any, @Param('id') id: string) {
    return this.usersService.delete(req.user.userId, req.user.role, id);
  }
}