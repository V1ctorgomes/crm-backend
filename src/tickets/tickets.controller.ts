import { Controller, Get, Post, Put, Delete, Body, Param, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  @Roles('ADMIN', 'USER')
  getBoard() { return this.ticketsService.getBoard(); }

  @Get('folders')
  @Roles('ADMIN', 'USER')
  getFolders() { return this.ticketsService.getFolders(); }

  @Get('contact/:number')
  @Roles('ADMIN', 'USER')
  getTicketByContact(@Param('number') number: string) {
    return this.ticketsService.getTicketByContact(number);
  }

  @Get('stages')
  @Roles('ADMIN', 'USER')
  getAllStages() { return this.ticketsService.getAllStages(); }

  @Get('archived')
  @Roles('ADMIN', 'USER')
  getArchivedTickets() { return this.ticketsService.getArchivedTickets(); }

  @Post('stages')
  @Roles('ADMIN', 'USER')
  createStage(@Body() body: { name: string; color: string }) {
    return this.ticketsService.createStage(body.name, body.color);
  }

  @Put('stages/reorder')
  @Roles('ADMIN', 'USER')
  reorderStages(@Body('stages') stages: { id: string; order: number }[]) {
    return this.ticketsService.reorderStages(stages);
  }

  @Put('stages/:id')
  @Roles('ADMIN', 'USER')
  updateStage(@Param('id') id: string, @Body() data: any) {
    return this.ticketsService.updateStage(id, data);
  }

  @Delete('stages/:id')
  @Roles('ADMIN', 'USER')
  deleteStage(@Param('id') id: string) {
    return this.ticketsService.deleteStage(id);
  }

  @Post()
  @Roles('ADMIN', 'USER')
  createTicket(@Body() body: any) {
    return this.ticketsService.createTicket(body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'USER')
  deleteTicket(@Param('id') id: string) {
    return this.ticketsService.deleteTicket(id);
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file'))
  @Roles('ADMIN', 'USER')
  uploadTicketFile(@Param('id') id: string, @UploadedFile() file: any, @Body('description') description?: string) {
    return this.ticketsService.uploadTicketFile(id, file, description);
  }

  @Delete('files/:fileId')
  @Roles('ADMIN', 'USER')
  deleteTicketFile(@Param('fileId') fileId: string) {
    return this.ticketsService.deleteTicketFile(fileId);
  }

  @Put(':id/stage')
  @Roles('ADMIN', 'USER')
  updateTicketStage(@Param('id') id: string, @Body('stageId') stageId: string) {
    return this.ticketsService.updateTicketStage(id, stageId);
  }

  @Put(':id/archive')
  @Roles('ADMIN', 'USER')
  toggleArchiveTicket(
    @Param('id') id: string, 
    @Body('isArchived') isArchived: boolean,
    @Body('resolution') resolution?: string,
    @Body('resolutionReason') resolutionReason?: string,
  ) {
    return this.ticketsService.toggleArchiveTicket(id, isArchived, resolution, resolutionReason);
  }

  @Post(':id/notes')
  @Roles('ADMIN', 'USER')
  addNote(@Param('id') id: string, @Body('text') text: string) {
    return this.ticketsService.addNote(id, text);
  }

  @Delete('notes/:id')
  @Roles('ADMIN', 'USER')
  deleteNote(@Param('id') id: string) {
    return this.ticketsService.deleteNote(id);
  }

  // ================= ROTAS DE TAREFAS / FOLLOW-UPS =================
  @Post(':id/tasks')
  @Roles('ADMIN', 'USER')
  addTask(@Param('id') id: string, @Body() body: { title: string, dueDate: string }) {
    return this.ticketsService.addTask(id, body.title, body.dueDate);
  }

  @Put('tasks/:taskId')
  @Roles('ADMIN', 'USER')
  toggleTask(@Param('taskId') taskId: string, @Body('isCompleted') isCompleted: boolean) {
    return this.ticketsService.toggleTask(taskId, isCompleted);
  }

  @Delete('tasks/:taskId')
  @Roles('ADMIN', 'USER')
  deleteTask(@Param('taskId') taskId: string) {
    return this.ticketsService.deleteTask(taskId);
  }
}