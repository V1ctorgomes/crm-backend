import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { UsersAdminListService } from './users-admin-list.service';
import { UsersPasswordResetAdminService } from './users-password-reset-admin.service';
import { UsersAdminMutationsService } from './users-admin-mutations.service';

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly list: UsersAdminListService,
    private readonly passwordReset: UsersPasswordResetAdminService,
    private readonly mutations: UsersAdminMutationsService,
  ) {}

  findAll(actorUserId: string, actorRole: string) {
    return this.list.findAll(actorUserId, actorRole);
  }

  findPending(actorRole: string) {
    return this.list.findPending(actorRole);
  }

  approvePending(actorRole: string, userId: string) {
    return this.list.approvePending(actorRole, userId);
  }

  findPasswordResetRequests(actorRole: string) {
    return this.passwordReset.findPasswordResetRequests(actorRole);
  }

  completePasswordResetRequest(actorRole: string, requestId: string, rawPassword?: string) {
    return this.passwordReset.completePasswordResetRequest(actorRole, requestId, rawPassword);
  }

  create(actorUserId: string, actorRole: string, data: any) {
    return this.mutations.create(actorUserId, actorRole, data);
  }

  delete(actorUserId: string, actorRole: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.mutations.delete(actorUserId, actorRole, id, actor, rawReason);
  }
}
