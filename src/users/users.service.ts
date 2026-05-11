import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? [user] : [];
  }

  async findOne(userId: string, id: string) {
    if (userId !== id) return null;
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: any) {
    return this.prisma.user.create({ data });
  }

  // Lógica principal de atualização do Perfil com foto
  async updateUser(userId: string, id: string, data: any, file?: any) {
    if (userId !== id) {
      throw new ForbiddenException('Acesso negado');
    }
    const updateData: any = {};
    
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.password && data.password.trim() !== '') {
      updateData.password = data.password;
    }

    if (file) {
      updateData.profilePictureUrl = await this.r2Service.uploadFile(file, `profiles/${id}`);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(userId: string, id: string) {
    if (userId !== id) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.prisma.user.delete({ where: { id } });
  }
}