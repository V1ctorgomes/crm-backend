import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeletionResourceType } from '../deletion-audit.constants';
import { revertCompany } from './handlers/company-revert.handler';
import { revertContactCompanyLink } from './handlers/contact-company-link-revert.handler';
import { revertContact } from './handlers/contact-revert.handler';
import { revertTicket } from './handlers/ticket-revert.handler';
import { revertTicketNote } from './handlers/ticket-note-revert.handler';
import { revertTicketStage } from './handlers/ticket-stage-revert.handler';
import { revertTicketTask } from './handlers/ticket-task-revert.handler';
import { revertWhatsappMessage } from './handlers/whatsapp-message-revert.handler';

@Injectable()
export class RevertDispatcherService {
  async applyRevert(
    tx: Prisma.TransactionClient,
    resourceType: string,
    snapshot: Prisma.JsonValue,
  ): Promise<void> {
    switch (resourceType) {
      case DeletionResourceType.TICKET_NOTE:
        await revertTicketNote(tx, snapshot);
        return;
      case DeletionResourceType.TICKET_TASK:
        await revertTicketTask(tx, snapshot);
        return;
      case DeletionResourceType.TICKET_STAGE:
        await revertTicketStage(tx, snapshot);
        return;
      case DeletionResourceType.TICKET:
        await revertTicket(tx, snapshot);
        return;
      case DeletionResourceType.CONTACT_COMPANY_LINK:
        await revertContactCompanyLink(tx, snapshot);
        return;
      case DeletionResourceType.COMPANY:
        await revertCompany(tx, snapshot);
        return;
      case DeletionResourceType.CONTACT:
        await revertContact(tx, snapshot);
        return;
      case DeletionResourceType.WHATSAPP_MESSAGE:
        await revertWhatsappMessage(tx, snapshot);
        return;
      default:
        throw new HttpException('Tipo não suportado.', HttpStatus.BAD_REQUEST);
    }
  }
}
