import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { assertPassword, assertRegisterName, normalizeEmail } from './auth-input.validation';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  /** Registo público: sempre perfil USER, aguarda aprovação de administrador. */
  async registerPublic(raw: { email?: string; password?: string; name?: string }): Promise<{ ok: true; message: string }> {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_PUBLIC_REGISTER !== 'true'
    ) {
      throw new ForbiddenException('Registo público desactivado neste ambiente.');
    }
    const email = normalizeEmail(raw.email);
    const password = assertPassword(raw.password);
    const name = assertRegisterName(raw.name);

    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) {
      throw new ConflictException(
        'Não foi possível concluir o registo com estes dados. Se já tem conta, peça aprovação ou recuperação de palavra-passe.',
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashed,
        role: 'USER',
        approved: false,
      },
    });

    return {
      ok: true,
      message:
        'Pedido de acesso criado. Quando um administrador aprovar a sua conta, poderá iniciar sessão.',
    };
  }

  /**
   * «Esqueci a palavra-passe»: não envia e-mail; cria pedido para o admin definir uma nova senha na área de usuarios.
   * Resposta genérica se o e-mail não existir (evita enumeração de contas).
   */
  async requestPasswordReset(rawEmail?: string): Promise<{ ok: true; message: string }> {
    const email = normalizeEmail(rawEmail);
    const generic = {
      ok: true as const,
      message:
        'Se este e-mail estiver associado a uma conta, o pedido foi registado. Um administrador definirá uma nova palavra-passe na área de usuarios.',
    };
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return generic;

    await this.prisma.passwordResetRequest.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await this.prisma.passwordResetRequest.create({
      data: { userId: user.id, status: 'PENDING' },
    });
    return generic;
  }

  async signIn(rawEmail: unknown, rawPassword: unknown): Promise<{ access_token: string; name: string; role: string }> {
    const email = normalizeEmail(rawEmail);
    const password = assertPassword(rawPassword);
    // 1. Procura o usuario pelo email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // 2. Compara a palavra-passe enviada com a hash guardada na base de dados
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.approved) {
      throw new UnauthorizedException(
        'A sua conta ainda não foi aprovada por um administrador. Aguarde ou contacte a equipe.',
      );
    }

    // 3. Gera o JWT Token se tudo estiver correto
    const payload = { sub: user.id, email: user.email, role: user.role };
    
    return {
      access_token: await this.jwtService.signAsync(payload),
      name: user.name,
      role: user.role,
    };
  }

  /** Dados mínimos para o ecrã de login (sem autenticação). */
  async findRecentMembersForLogin(limit = 3) {
    const take = Math.min(Math.max(Number(limit) || 3, 1), 10);
    const users = await this.prisma.user.findMany({
      where: { approved: true },
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, profilePictureUrl: true },
    });
    return { users };
  }
}