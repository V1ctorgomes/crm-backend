import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';
import * as bcrypt from 'bcrypt';

function canManageAllUsers(role: string): boolean {
  return role === 'ADMIN' || role === 'DEVELOPER';
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  async findAll(actorUserId: string, actorRole: string) {
    if (canManageAllUsers(actorRole)) {
      return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    }
    const user = await this.prisma.user.findUnique({ where: { id: actorUserId } });
    return user ? [user] : [];
  }

  /** Perfil do utilizador autenticado (sidebar, configurações, instâncias). */
  async findMe(actorUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: actorUserId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    return user;
  }

  async findOne(actorUserId: string, actorRole: string, id: string) {
    if (canManageAllUsers(actorRole) || actorUserId === id) {
      return this.prisma.user.findUnique({ where: { id } });
    }
    return null;
  }

  async create(actorUserId: string, actorRole: string, data: any) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Apenas administradores podem criar utilizadores.');
    }
    const password = String(data.password || '');
    if (!password.trim()) {
      throw new ForbiddenException('Palavra-passe é obrigatória para novos utilizadores.');
    }
    const hashed = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: data.role && String(data.role).trim() !== '' ? String(data.role) : 'USER',
      },
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

    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;

    if (canManageAllUsers(actorRole) && data.role !== undefined && data.role !== null) {
      updateData.role = String(data.role);
    }

    if (data.password && String(data.password).trim() !== '') {
      updateData.password = await bcrypt.hash(String(data.password), 10);
    }

    if (file) {
      updateData.profilePictureUrl = await this.r2Service.uploadFile(file, `profiles/${id}`);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(actorUserId: string, actorRole: string, id: string) {
    if (!canManageAllUsers(actorRole)) {
      throw new ForbiddenException('Apenas administradores podem remover utilizadores.');
    }
    if (actorUserId === id) {
      throw new ForbiddenException('Não pode remover a sua própria conta neste ecrã.');
    }
    return this.prisma.user.delete({ where: { id } });
  }
}
