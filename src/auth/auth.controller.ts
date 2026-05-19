import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

/** Rotas públicas de autenticação — limite mais baixo que a API geral. */
const AUTH_THROTTLE = { default: { limit: 15, ttl: 900_000 } };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.CREATED)
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() body: { email?: string; password?: string; name?: string }) {
    return this.authService.registerPublic(body);
  }

  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @Post('request-password-reset')
  async requestPasswordReset(@Body() body: { email?: string }) {
    return this.authService.requestPasswordReset(body.email);
  }

  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  async signIn(
    @Body() signInDto: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(signInDto?.email, signInDto?.password);
    const maxAgeMs = 8 * 60 * 60 * 1000;
    const domain = process.env.COOKIE_DOMAIN?.trim();
    const cookieBase = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
      ...(domain ? { domain } : {}),
    };
    res.cookie('token', result.access_token, cookieBase);
    return { name: result.name, role: result.role };
  }

  /** Remove o cookie HttpOnly (público: o browser pode chamar após falha de rede). */
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    const domain = process.env.COOKIE_DOMAIN?.trim();
    res.clearCookie('token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      ...(domain ? { domain } : {}),
    });
    return { ok: true as const };
  }

  /** Público: últimos membros (avatar + nome) para o banner do login. */
  @Get('recent-members')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  recentMembers(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 3;
    const capped = Number.isFinite(n) ? Math.min(Math.max(n, 1), 12) : 3;
    return this.authService.findRecentMembersForLogin(capped);
  }
}
