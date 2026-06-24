import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canManageAllUsers } from './users-role.util';
import { USER_PUBLIC_SELECT } from '../common/user-public.select';

@Injectable()
export class UsersAdminListService {
  constructor(private prisma: PrismaService) {}

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
}
