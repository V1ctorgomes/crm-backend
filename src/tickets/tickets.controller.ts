import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  getBoard(@Req() req) { return this.ticketsService.getBoard(req.user.id); }

  @Get('folders')
  getFolders(@Req() req) { return this.ticketsService.getFolders(req.user.id); }

  @Get('stages')
  getAllStages(@Req() req) { return this.ticketsService.getAllStages(req.user.id); }

  @Get('archived')
  getArchivedTickets(@Req() req) { return this.ticketsService.getArchivedTickets(req.user.id); }

  @Post('stages')
  createStage(@Req() req, @Body() body: { name: string; color: string }) {
    return this.ticketsService.createStage(req.user.id, body.name, body.color);
  }

  @Post()
  createTicket(@Req() req, @Body() body: any) {
    return this.ticketsService.createTicket(req.user.id, body);
  }

  // Restantes rotas recebem req.user.id nos Services correspondentes...
}