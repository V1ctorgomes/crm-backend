import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  getBoard() {
    return this.ticketsService.getBoard();
  }

  @Post('stages')
  createStage(@Body('name') name: string) {
    return this.ticketsService.createStage(name);
  }

  @Post()
  createTicket(@Body() body: any) {
    return this.ticketsService.createTicket(body);
  }

  @Put(':id/stage')
  updateTicketStage(@Param('id') id: string, @Body('stageId') stageId: string) {
    return this.ticketsService.updateTicketStage(id, stageId);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body('text') text: string) {
    return this.ticketsService.addNote(id, text);
  }
}