import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertPassword, assertRegisterName, normalizeEmail } from '../auth/auth-input.validation';
import { assertUuidParam } from '../common/uuid-param';
import { USER_PUBLIC_SELECT } from '../common/user-public.select';
import { canManageAllUsers, resolveManagedUserRole } from './users-role.util';

@Injectable()
export class UsersAdminService {
  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
  ) {}

  async findAll(actorUserId: string, actorRole: string) {
    if (canManageAllUsers(actorRole)) {
      return this.prisma.user.findMany({
        where: { approved: true },
        orderBy: { createdAt: 'desc' },
        select: USER_PUBLIC_SELECT,
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: USER_PUBLIC_SELECT,
    });
    return user ? [user] : [];
  }

  /** Contas de registo público à espera de aprovação (só USER). */
  async findPending(actorRole: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Sem permissão para listar pedidos pendentes.');
    }
    return this.prisma.user.findMany({
      where: { approved: false, role: 'USER' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approved: true,
        createdAt: true,
        profilePictureUrl: true,
      },
    });
  }

  async approvePending(actorRole: string, userId: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Sem permissão para aprovar usuarios.');
    }
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('Usuario não encontrado.');
    if (u.approved) {
      throw new BadRequestException('Esta conta já está aprovada.');
    }
    if (u.role !== 'USER') {
      throw new BadRequestException('Apenas pedidos de atendimento (USER) podem ser aprovados por este fluxo.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { approved: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approved: true,
        createdAt: true,
        profilePictureUrl: true,
      },
    });
  }

  async findPasswordResetRequests(actorRole: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Sem permissão para listar pedidos de palavra-passe.');
    }
    return this.prisma.passwordResetRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, approved: true },
        },
      },
    });
  }

  async completePasswordResetRequest(actorRole: string, requestId: string, rawPassword?: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Sem permissão para concluir este pedido.');
    }
    const pwd = assertPassword(rawPassword, 'nova palavra-passe');
    const reqId = assertUuidParam(requestId, 'Pedido');
    const row = await this.prisma.passwordResetRequest.findUnique({
      where: { id: reqId },
      include: { user: { select: { id: true } } },
    });
    if (!row || row.status !== 'PENDING') {
      throw new NotFoundException('Pedido não encontrado ou já foi tratado.');
    }
    const hashed = await bcrypt.hash(pwd, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { password: hashed },
      }),
      this.prisma.passwordResetRequest.update({
        where: { id: reqId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
    ]);
    return {
      ok: true as const,
      message: 'Nova palavra-passe definida. O usuario pode iniciar sessão com a nova senha.',
    };
  }

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
