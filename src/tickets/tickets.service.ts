import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { TicketBoardService } from './ticket-board.service';
import { TicketFilesService } from './ticket-files.service';
import { TicketLifecycleService } from './ticket-lifecycle.service';
import { TicketNotesService } from './ticket-notes.service';
import { TicketStagesService } from './ticket-stages.service';
import { TicketTasksService } from './ticket-tasks.service';

@Injectable()
export class TicketsService {
  constructor(
    private board: TicketBoardService,
    private files: TicketFilesService,
    private lifecycle: TicketLifecycleService,
    private notes: TicketNotesService,
    private stages: TicketStagesService,
    private tasks: TicketTasksService,
  ) {}

  getBoard(userId: string) {
    return this.board.getBoard(userId);
  }

  getFolders(userId: string) {
    return this.board.getFolders(userId);
  }

  uploadTicketFile(userId: string, ticketId: string, file: any, description?: string) {
    return this.files.uploadTicketFile(userId, ticketId, file, description);
  }

  deleteTicketFile(userId: string, fileId: string, actor: AuditActor, rawReason?: string) {
    return this.files.deleteTicketFile(userId, fileId, actor, rawReason);
  }

  deleteTicket(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.lifecycle.deleteTicket(userId, id, actor, rawReason);
  }

  getTicketByContact(userId: string, contactNumber: string) {
    return this.lifecycle.getTicketByContact(userId, contactNumber);
  }

  getAllStages(userId: string) {
    return this.stages.getAllStages(userId);
  }

  getArchivedTickets(userId: string) {
    return this.lifecycle.getArchivedTickets(userId);
  }

  createStage(userId: string, name: string, color: string) {
    return this.stages.createStage(userId, name, color);
  }

  updateStage(userId: string, id: string, data: { name?: string; color?: string; isActive?: boolean }) {
    return this.stages.updateStage(userId, id, data);
  }

  deleteStage(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.stages.deleteStage(userId, id, actor, rawReason);
  }

  reorderStages(userId: string, stages: { id: string; order: number }[]) {
    return this.stages.reorderStages(userId, stages);
  }

  createTicket(userId: string, data: { contactNumber: string, nome: string, email: string, cpf: string, marca: string, modelo: string, customerType?: string, ticketType?: string, stageId: string, companyId?: string | null }) {
    return this.lifecycle.createTicket(userId, data);
  }

  updateTicketDetails(
    userId: string,
    ticketId: string,
    raw: {
      nome?: string;
      email?: string;
      cpf?: string;
      marca?: string;
      modelo?: string;
      customerType?: string;
      ticketType?: string;
      companyId?: string | null;
    },
  ) {
    return this.lifecycle.updateTicketDetails(userId, ticketId, raw);
  }

  updateTicketStage(userId: string, ticketId: string, stageId: string) {
    return this.lifecycle.updateTicketStage(userId, ticketId, stageId);
  }

  toggleArchiveTicket(userId: string, ticketId: string, isArchived: boolean, resolution?: string, resolutionReason?: string) {
    return this.lifecycle.toggleArchiveTicket(userId, ticketId, isArchived, resolution, resolutionReason);
  }

  addNote(userId: string, ticketId: string, text: string) {
    return this.notes.addNote(userId, ticketId, text);
  }

  deleteNote(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.notes.deleteNote(userId, id, actor, rawReason);
  }

  addTask(userId: string, ticketId: string, title: string, dueDate: string) {
    return this.tasks.addTask(userId, ticketId, title, dueDate);
  }

  toggleTask(userId: string, id: string, isCompleted: boolean) {
    return this.tasks.toggleTask(userId, id, isCompleted);
  }

  deleteTask(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.tasks.deleteTask(userId, id, actor, rawReason);
  }
}
