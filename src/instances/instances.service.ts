import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { InstanceCrudService } from './instance-crud.service';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { assertInstanceUserIdParam } from './instance-ownership.util';
import { assertUserIdParam } from './instances.validation';

@Injectable()
export class InstancesService {
  constructor(
    private readonly crud: InstanceCrudService,
    private readonly evolutionSync: InstanceEvolutionSyncService,
  ) {}

  findAllForUser(actorUserId: string, requestedUserId: string) {
    const userId = assertUserIdParam(requestedUserId);
    assertInstanceUserIdParam(userId, actorUserId);
    return this.crud.findAllForUser(userId);
  }

  create(userId: string, data: Record<string, unknown>) {
    return this.crud.create(userId, data);
  }

  checkStatus(actorUserId: string, instanceName: string) {
    return this.crud.checkStatus(actorUserId, instanceName);
  }

  getQrCode(actorUserId: string, instanceName: string) {
    return this.crud.getQrCode(actorUserId, instanceName);
  }

  updateSettings(actorUserId: string, instanceName: string, data: Record<string, unknown>) {
    return this.crud.updateSettings(actorUserId, instanceName, data);
  }

  remove(instanceName: string, actor: AuditActor, rawReason?: string) {
    return this.crud.remove(instanceName, actor, rawReason);
  }

  syncAllWebhooks(actorRole: string) {
    if (actorRole !== 'ADMIN' && actorRole !== 'DEVELOPER') {
      throw new ForbiddenException('Sem permissão para sincronizar webhooks.');
    }
    return this.evolutionSync.syncAllWebhooks();
  }
}
