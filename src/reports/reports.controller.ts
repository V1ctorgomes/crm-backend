import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DEVELOPER')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('team-overview')
  getTeamOverview(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.getTeamOverview(req.user.role, from?.trim() || undefined, to?.trim() || undefined);
  }
}
