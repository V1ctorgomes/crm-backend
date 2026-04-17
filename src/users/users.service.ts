import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(data: any) {
    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new HttpException('Email já está em uso', HttpStatus.BAD_REQUEST);
    
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: { name: data.name, email: data.email, password: hashedPassword, role: data.role },
      select: { id: true, name: true, email: true, role: true }
    });
  }

  async update(id: string, data: any) {
    const updateData: any = { name: data.name, email: data.email, role: data.role };
    
    if (data.password && data.password.trim() !== '') {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id }, data: updateData,
      select: { id: true, name: true, email: true, role: true }
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}