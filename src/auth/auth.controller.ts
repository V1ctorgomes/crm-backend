import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.email, signInDto.password);
  }

  /** Público: últimos membros (avatar + nome) para o banner do login. */
  @Get('recent-members')
  recentMembers(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 3;
    return this.authService.findRecentMembersForLogin(Number.isFinite(n) ? n : 3);
  }
}