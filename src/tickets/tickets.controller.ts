import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  getBoard() { return this.ticketsService.getBoard(); }

  // NOVO: Endpoint chamado pelo Frontend para ver se o cliente tem solicitação aberta
  @Get('contact/:number')
  getTicketByContact(@Param('number') number: string) {
    return this.ticketsService.getTicketByContact(number);
  }

  @Get('stages')
  getAllStages() { return this.ticketsService.getAllStages(); }

  @Get('archived')
  getArchivedTickets() { return this.ticketsService.getArchivedTickets(); }

  @Post('stages')
  createStage(@Body() body: { name: string; color: string }) {
    return this.ticketsService.createStage(body.name, body.color);
  }

  @Put('stages/reorder')
  reorderStages(@Body('stages') stages: { id: string; order: number }[]) {
    return this.ticketsService.reorderStages(stages);
  }

  @Put('stages/:id')
  updateStage(@Param('id') id: string, @Body() data: any) {
    return this.ticketsService.updateStage(id, data);
  }

  @Delete('stages/:id')
  deleteStage(@Param('id') id: string) {
    return this.ticketsService.deleteStage(id);
  }

  @Post()
  createTicket(@Body() body: any) {
    return this.ticketsService.createTicket(body);
  }

  @Put(':id/stage')
  updateTicketStage(@Param('id') id: string, @Body('stageId') stageId: string) {
    return this.ticketsService.updateTicketStage(id, stageId);
  }

  @Put(':id/archive')
  toggleArchiveTicket(@Param('id') id: string, @Body('isArchived') isArchived: boolean) {
    return this.ticketsService.toggleArchiveTicket(id, isArchived);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body('text') text: string) {
    return this.ticketsService.addNote(id, text);
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string) {
    return this.ticketsService.deleteNote(id);
  }
}