import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { assertPassword } from '../auth/auth-input.validation';
import { assertUuidParam } from '../common/uuid-param';
import { canManageAllUsers } from './users-role.util';

@Injectable()
export class UsersPasswordResetAdminService {
  constructor(private prisma: PrismaService) {}

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
}
