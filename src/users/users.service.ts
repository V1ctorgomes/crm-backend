import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../whatsapp/r2.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private r2Service: R2Service) {}

  async findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: any) {
    // Hash da senha antes de salvar no banco
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({ 
      data: {
        ...data,
        password: hashedPassword
      }
    });
  }

  // Lógica principal de atualização do Perfil com foto
  async updateUser(id: string, data: any, file?: any) {
    const updateData: any = {};
    
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.password && data.password.trim() !== '') {
      // Hash da senha também na atualização
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    if (file) {
      updateData.profilePictureUrl = await this.r2Service.uploadFile(file, `profiles/${id}`);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}