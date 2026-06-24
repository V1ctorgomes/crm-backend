import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertPassword, assertRegisterName, normalizeEmail } from '../auth/auth-input.validation';
import { USER_PUBLIC_SELECT } from '../common/user-public.select';
import { canManageAllUsers, resolveManagedUserRole } from './users-role.util';

@Injectable()
export class UsersAdminMutationsService {
  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async create(actorUserId: string, actorRole: string, data: any) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Apenas administradores ou developers podem criar usuarios.');
    }
    const password = assertPassword(data.password, 'palavra-passe');
    const email = normalizeEmail(data.email);
    const name = assertRegisterName(data.name);
    const hashed = await bcrypt.hash(password, 10);
    let role = 'USER';
    if (canManageAllUsers(actorRole)) {
      role = resolveManagedUserRole(actorRole, data.role);
    }
    return this.prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        approved: true,
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async delete(actorUserId: string, actorRole: string, id: string, actor: AuditActor, rawReason?: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Apenas administradores ou developers podem remover usuarios.');
    }
    if (actorUserId === id) {
      throw new ForbiddenException('Não pode remover a sua própria conta neste ecrã.');
    }
    const victim = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profilePictureUrl: true,
        approved: true,
        createdAt: true,
      },
    });
    if (!victim) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.USER,
        resourceId: id,
        rawReason,
        snapshot: victim,
      });
    });
    return { success: true };
  }
}
