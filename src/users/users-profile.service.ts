import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { assertPassword, assertRegisterName, normalizeEmail } from '../auth/auth-input.validation';
import { assertProfileImageUpload } from '../common/upload-image.validation';
import { assertUuidParam } from '../common/uuid-param';
import { USER_PUBLIC_SELECT } from '../common/user-public.select';
import { canManageAllUsers, resolveManagedUserRole } from './users-role.util';

@Injectable()
export class UsersProfileService {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
  ) {}

  /** Perfil do usuario autenticado (sidebar, configurações, instâncias). */
  async findMe(actorUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario não encontrado.');
    return user;
  }

  async findOne(actorUserId: string, actorRole: string, id: string) {
    const targetId = assertUuidParam(id, 'Utilizador');
    if (!canManageAllUsers(actorRole) && actorUserId !== targetId) {
      throw new ForbiddenException('Sem permissão para ver este utilizador.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    return user;
  }

  async updateUser(
    actorUserId: string,
    actorRole: string,
    id: string,
    data: any,
    file?: any,
  ) {
    const isSelf = actorUserId === id;
    if (!isSelf && !canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Acesso negado');
    }

    const updateData: any = {};

    if (data.name) updateData.name = assertRegisterName(data.name);
    if (data.email) updateData.email = normalizeEmail(data.email);

    if (data.role !== undefined && data.role !== null && canManageAllUsers(actorRole) && !isSelf) {
      updateData.role = resolveManagedUserRole(actorRole, data.role);
    }

    if (data.password && String(data.password).trim() !== '') {
      updateData.password = await bcrypt.hash(assertPassword(data.password), 10);
    }

    assertProfileImageUpload(file);

    let previousProfilePictureUrl: string | null = null;
    if (file) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { profilePictureUrl: true },
      });
      previousProfilePictureUrl = existing?.profilePictureUrl ?? null;
      updateData.profilePictureUrl = await this.r2Service.uploadFile(file, this.r2Service.perfilPath(id));
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: USER_PUBLIC_SELECT,
    });

    if (file && previousProfilePictureUrl && previousProfilePictureUrl !== user.profilePictureUrl) {
      const cfg = await this.r2Service.resolveR2FromEnvOrDb();
      const base = cfg?.publicUrl?.replace(/\/+$/, '') ?? '';
      if (base && previousProfilePictureUrl.startsWith(base)) {
        await this.r2Service.deleteFile(previousProfilePictureUrl);
      }
    }

    return user;
  }
}
