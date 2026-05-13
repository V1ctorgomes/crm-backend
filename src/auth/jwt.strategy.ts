import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../config/jwt-secret';

function jwtFromCookieOrBearer(req: Request): string | null {
  const fromCookie = req?.cookies?.token;
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: jwtFromCookieOrBearer,
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, approved: true },
    });
    if (!user) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    if (!user.approved) {
      throw new UnauthorizedException('Conta pendente de aprovação.');
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
