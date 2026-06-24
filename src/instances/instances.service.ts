import { Injectable } from '@nestjs/common';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { InstanceCrudService } from './instance-crud.service';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';

@Injectable()
export class InstancesService {
  constructor(
    private readonly crud: InstanceCrudService,
    private readonly evolutionSync: InstanceEvolutionSyncService,
  ) {}

  findAll() {
    return this.crud.findAll();
  }

  create(userId: string, data: Record<string, unknown>) {
    return this.crud.create(userId, data);
  }

  checkStatus(instanceName: string) {
    return this.crud.checkStatus(instanceName);
  }

  getQrCode(instanceName: string) {
    return this.crud.getQrCode(instanceName);
  }

  updateSettings(instanceName: string, data: any) {
    return this.crud.updateSettings(instanceName, data);
  }

  remove(instanceName: string, actor: AuditActor, rawReason?: string) {
    return this.crud.remove(instanceName, actor, rawReason);
  }

  syncAllWebhooks() {
    return this.evolutionSync.syncAllWebhooks();
  }
}
