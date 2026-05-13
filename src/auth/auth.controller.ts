import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UseGuards(ThrottlerGuard)
  async signIn(
    @Body() signInDto: Record<string, any>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(signInDto.email, signInDto.password);
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
  recentMembers(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 3;
    return this.authService.findRecentMembersForLogin(Number.isFinite(n) ? n : 3);
  }
}
