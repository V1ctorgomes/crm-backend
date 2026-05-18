import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

function actorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('board')
  getBoard(@Req() req: any) { return this.ticketsService.getBoard(req.user.userId); }

  @Get('folders')
  getFolders(@Req() req: any) { return this.ticketsService.getFolders(req.user.userId); }

  @Get('contact/:number')
  getTicketByContact(@Req() req: any, @Param('number') number: string) {
    return this.ticketsService.getTicketByContact(req.user.userId, number);
  }

  @Get('stages')
  getAllStages(@Req() req: any) { return this.ticketsService.getAllStages(req.user.userId); }

  @Get('archived')
  getArchivedTickets(@Req() req: any) { return this.ticketsService.getArchivedTickets(req.user.userId); }

  @Post('stages')
  createStage(@Req() req: any, @Body() body: { name: string; color: string }) {
    return this.ticketsService.createStage(req.user.userId, body.name, body.color);
  }

  @Put('stages/reorder')
  reorderStages(@Req() req: any, @Body('stages') stages: { id: string; order: number }[]) {
    return this.ticketsService.reorderStages(req.user.userId, stages);
  }

  @Put('stages/:id')
  updateStage(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return this.ticketsService.updateStage(req.user.userId, id, data);
  }

  @Delete('stages/:id')
  deleteStage(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.ticketsService.deleteStage(req.user.userId, id, actorFromReq(req), body?.reason);
  }

  @Post()
  createTicket(@Req() req: any, @Body() body: any) {
    return this.ticketsService.createTicket(req.user.userId, body);
  }

  @Put(':id')
  updateTicketDetails(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.ticketsService.updateTicketDetails(req.user.userId, id, body);
  }

  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadTicketFile(@Req() req: any, @Param('id') id: string, @UploadedFile() file: any, @Body('description') description?: string) {
    return this.ticketsService.uploadTicketFile(req.user.userId, id, file, description);
  }

  @Delete('files/:fileId')
  deleteTicketFile(@Req() req: any, @Param('fileId') fileId: string, @Body() body?: { reason?: string }) {
    return this.ticketsService.deleteTicketFile(req.user.userId, fileId, actorFromReq(req), body?.reason);
  }

  @Put(':id/stage')
  updateTicketStage(@Req() req: any, @Param('id') id: string, @Body('stageId') stageId: string) {
    return this.ticketsService.updateTicketStage(req.user.userId, id, stageId);
  }

  @Put(':id/archive')
  toggleArchiveTicket(
    @Req() req: any,
    @Param('id') id: string, 
    @Body('isArchived') isArchived: boolean,
    @Body('resolution') resolution?: string,
    @Body('resolutionReason') resolutionReason?: string,
  ) {
    return this.ticketsService.toggleArchiveTicket(req.user.userId, id, isArchived, resolution, resolutionReason);
  }

  @Post(':id/notes')
  addNote(@Req() req: any, @Param('id') id: string, @Body('text') text: string) {
    return this.ticketsService.addNote(req.user.userId, id, text);
  }

  @Delete('notes/:id')
  deleteNote(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.ticketsService.deleteNote(req.user.userId, id, actorFromReq(req), body?.reason);
  }

  // ================= ROTAS DE TAREFAS / FOLLOW-UPS =================
  @Post(':id/tasks')
  addTask(@Req() req: any, @Param('id') id: string, @Body() body: { title: string, dueDate: string }) {
    return this.ticketsService.addTask(req.user.userId, id, body.title, body.dueDate);
  }

  @Put('tasks/:taskId')
  toggleTask(@Req() req: any, @Param('taskId') taskId: string, @Body('isCompleted') isCompleted: boolean) {
    return this.ticketsService.toggleTask(req.user.userId, taskId, isCompleted);
  }

  @Delete('tasks/:taskId')
  deleteTask(@Req() req: any, @Param('taskId') taskId: string, @Body() body?: { reason?: string }) {
    return this.ticketsService.deleteTask(req.user.userId, taskId, actorFromReq(req), body?.reason);
  }

  /** Por último: evita que `DELETE /tickets/:id` roube `DELETE /tickets/stages/:id` em alguns ambientes. */
  @Delete(':id')
  deleteTicket(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.ticketsService.deleteTicket(req.user.userId, id, actorFromReq(req), body?.reason);
  }
}