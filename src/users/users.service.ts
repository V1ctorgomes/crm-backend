import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';
import * as bcrypt from 'bcrypt';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { assertPassword, assertRegisterName, normalizeEmail } from '../auth/auth-input.validation';
import { assertProfileImageUpload } from '../common/upload-image.validation';
import { assertUuidParam } from '../common/uuid-param';
import { USER_PUBLIC_SELECT } from '../common/user-public.select';

function canManageAllUsers(role: string): boolean {
  return role === 'ADMIN' || role === 'DEVELOPER';
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private r2Service: R2Service,
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

  async create(actorUserId: string, actorRole: string, data: any) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Apenas administradores ou developers podem criar usuarios.');
    }
    const password = assertPassword(data.password, 'palavra-passe');
    const email = normalizeEmail(data.email);
    const name = assertRegisterName(data.name);
    const hashed = await bcrypt.hash(password, 10);
    let role = 'USER';
    if (actorRole === 'ADMIN') {
      role = 'USER';
    } else if (actorRole === 'DEVELOPER') {
      const r = String(data.role || 'USER').toUpperCase();
      if (r === 'ADMIN') {
        throw new ForbiddenException('Developers não podem criar contas ADMIN.');
      }
      role = r === 'DEVELOPER' ? 'DEVELOPER' : 'USER';
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

    if (data.role !== undefined && data.role !== null && canManageAllUsers(actorRole)) {
      if (actorRole === 'ADMIN') {
        if (!isSelf) {
          updateData.role = 'USER';
        }
      } else if (actorRole === 'DEVELOPER') {
        const r = String(data.role).toUpperCase();
        if (r === 'ADMIN') {
          throw new ForbiddenException('Developers não podem atribuir papel ADMIN.');
        }
        if (r === 'USER' || r === 'DEVELOPER') {
          updateData.role = r;
        }
      }
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
