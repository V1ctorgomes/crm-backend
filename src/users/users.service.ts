import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { UsersAdminService } from './users-admin.service';
import { UsersProfileService } from './users-profile.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly admin: UsersAdminService,
    private readonly profile: UsersProfileService,
  ) {}

  findAll(actorUserId: string, actorRole: string) {
    return this.admin.findAll(actorUserId, actorRole);
  }

  findPending(actorRole: string) {
    return this.admin.findPending(actorRole);
  }

  approvePending(actorRole: string, userId: string) {
    return this.admin.approvePending(actorRole, userId);
  }

  findPasswordResetRequests(actorRole: string) {
    return this.admin.findPasswordResetRequests(actorRole);
  }

  completePasswordResetRequest(actorRole: string, requestId: string, rawPassword?: string) {
    return this.admin.completePasswordResetRequest(actorRole, requestId, rawPassword);
  }

  create(actorUserId: string, actorRole: string, data: any) {
    return this.admin.create(actorUserId, actorRole, data);
  }

  delete(actorUserId: string, actorRole: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.admin.delete(actorUserId, actorRole, id, actor, rawReason);
  }

  findMe(actorUserId: string) {
    return this.profile.findMe(actorUserId);
  }

  findOne(actorUserId: string, actorRole: string, id: string) {
    return this.profile.findOne(actorUserId, actorRole, id);
  }

  updateUser(actorUserId: string, actorRole: string, id: string, data: any, file?: any) {
    return this.profile.updateUser(actorUserId, actorRole, id, data, file);
  }
}
