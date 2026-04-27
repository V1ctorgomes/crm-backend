import { Controller, Get, Post, Put, Delete, Body, Param, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  getBoard() { return this.ticketsService.getBoard(); }

  @Get('folders')
  getFolders() { return this.ticketsService.getFolders(); }

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

  @Delete(':id')
  deleteTicket(@Param('id') id: string) {
    return this.ticketsService.deleteTicket(id);
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file'))
  uploadTicketFile(@Param('id') id: string, @UploadedFile() file: any, @Body('description') description?: string) {
    return this.ticketsService.uploadTicketFile(id, file, description);
  }

  @Delete('files/:fileId')
  deleteTicketFile(@Param('fileId') fileId: string) {
    return this.ticketsService.deleteTicketFile(fileId);
  }

  @Put(':id/stage')
  updateTicketStage(@Param('id') id: string, @Body('stageId') stageId: string) {
    return this.ticketsService.updateTicketStage(id, stageId);
  }

  @Put(':id/archive')
  toggleArchiveTicket(
    @Param('id') id: string, 
    @Body('isArchived') isArchived: boolean,
    @Body('resolution') resolution?: string,
    @Body('resolutionReason') resolutionReason?: string,
  ) {
    return this.ticketsService.toggleArchiveTicket(id, isArchived, resolution, resolutionReason);
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