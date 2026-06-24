import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { TicketCreateService } from './ticket-create.service';
import { TicketUpdateService } from './ticket-update.service';
import { TicketQueryService } from './ticket-query.service';

@Injectable()
export class TicketLifecycleService {
  constructor(
    private readonly createSvc: TicketCreateService,
    private readonly updateSvc: TicketUpdateService,
    private readonly querySvc: TicketQueryService,
  ) {}

  createTicket(
    userId: string,
    data: {
      contactNumber: string;
      nome: string;
      email: string;
      cpf: string;
      marca: string;
      modelo: string;
      customerType?: string;
      ticketType?: string;
      stageId: string;
      companyId?: string | null;
    },
  ) {
    return this.createSvc.createTicket(userId, data);
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
    return this.updateSvc.updateTicketDetails(userId, ticketId, raw);
  }

  updateTicketStage(userId: string, ticketId: string, stageId: string) {
    return this.updateSvc.updateTicketStage(userId, ticketId, stageId);
  }

  toggleArchiveTicket(
    userId: string,
    ticketId: string,
    isArchived: boolean,
    resolution?: string,
    resolutionReason?: string,
  ) {
    return this.updateSvc.toggleArchiveTicket(userId, ticketId, isArchived, resolution, resolutionReason);
  }

  deleteTicket(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.updateSvc.deleteTicket(userId, id, actor, rawReason);
  }

  getTicketByContact(userId: string, contactNumber: string) {
    return this.querySvc.getTicketByContact(userId, contactNumber);
  }

  getArchivedTickets(userId: string) {
    return this.querySvc.getArchivedTickets(userId);
  }
}
