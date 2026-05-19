import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { DeletionRevertService } from '../deletion-audit/deletion-revert.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PROFILE_IMAGE_MAX_BYTES } from '../common/upload-image.validation';

function actorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly deletionRevertService: DeletionRevertService,
  ) {}

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

  @Get('password-reset-requests')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  listPasswordResetRequests(@Req() req: any) {
    return this.usersService.findPasswordResetRequests(req.user.role);
  }

  @Post('password-reset-requests/:id/set-password')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  setPasswordFromResetRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { newPassword?: string },
  ) {
    return this.usersService.completePasswordResetRequest(req.user.role, id, body.newPassword);
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

  /** Exclusões auditadas recentes (atendimento, admin ou developer) — reversão pelo admin até 24 h. */
  @Get('deletion-audits/recent')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  listUserDeletionAuditsForRevert() {
    return this.deletionRevertService.listRecentUserDeletions();
  }

  @Post('deletion-audits/:auditId/revert')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  revertUserDeletion(@Req() req: any, @Param('auditId') auditId: string) {
    return this.deletionRevertService.revertUserDeletion(auditId, req.user.userId);
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
      limits: { fileSize: PROFILE_IMAGE_MAX_BYTES },
    }),
  )
  update(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body() body: any) {
    return this.usersService.updateUser(req.user.userId, req.user.role, id, body, file);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'DEVELOPER')
  delete(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.usersService.delete(req.user.userId, req.user.role, id, actorFromReq(req), body?.reason);
  }
}