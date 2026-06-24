import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { ContactsListService } from './contacts-list.service';
import { ContactsHistoryService } from './contacts-history.service';

@Injectable()
export class WhatsappContactsService {
  constructor(
    private readonly list: ContactsListService,
    private readonly history: ContactsHistoryService,
  ) {}

  getContacts(userId: string) {
    return this.list.getContacts(userId);
  }

  getChatHistory(userId: string, number: string, opts?: { limit?: number; beforeMessageId?: string }) {
    return this.history.getChatHistory(userId, number, opts);
  }

  deleteConversation(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    return this.history.deleteConversation(userId, number, actor, rawReason);
  }

  updateContact(userId: string, number: string, data: Record<string, unknown>) {
    return this.list.updateContact(userId, number, data);
  }

  removeContact(userId: string, number: string, actor: AuditActor, rawReason?: string) {
    return this.list.removeContact(userId, number, actor, rawReason);
  }

  refreshContactLastMessage(userId: string, contactNumber: string) {
    return this.list.refreshContactLastMessage(userId, contactNumber);
  }
}
