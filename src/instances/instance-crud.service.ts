import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { decryptField } from '../common/field-crypto';
import { maskSecret } from '../common/mask-secret';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { InstanceCreateService } from './instance-create.service';
import { assertInstanceOwned } from './instance-ownership.util';

@Injectable()
export class InstanceCrudService {
  private readonly logger = new Logger(InstanceCrudService.name);

  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
    private evolutionSync: InstanceEvolutionSyncService,
    private createService: InstanceCreateService,
  ) {}

  private toPublicInstance(row: {
    id: string;
    name: string;
    status: string;
    rejectCalls: boolean;
    ignoreGroups: boolean;
    proxyHost: string | null;
    proxyPort: string | null;
    proxyUser: string | null;
    proxyPass: string | null;
    proxyProto: string | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const plainPass = row.proxyPass ? decryptField(row.proxyPass) : null;
    return {
      ...row,
      proxyPass: plainPass ? maskSecret(plainPass) : null,
    };
  }

  async findAllForUser(userId: string) {
    const instances = await this.prisma.instance.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    try {
      await Promise.allSettled(instances.map((inst) => this.checkStatus(userId, inst.name)));
    } catch (e) {
      this.logger.warn('Não foi possível verificar o status das instâncias. Verifique as credenciais da API.');
    }

    const rows = await this.prisma.instance.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toPublicInstance(row));
  }

  create(userId: string, data: Record<string, unknown>) {
    return this.createService.create(userId, data);
  }

  private async getOwnedInstance(userId: string, instanceName: string) {
    const inst = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    return assertInstanceOwned(inst, userId);
  }

  async checkStatus(userId: string, instanceName: string) {
    await this.getOwnedInstance(userId, instanceName);
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connectionState/${instanceName}`, {
        headers: { apikey: evoKey },
      });
      const state = res.data?.instance?.state === 'open' ? 'connected' : 'disconnected';
      await this.prisma.instance.update({ where: { name: instanceName }, data: { status: state } });
      return { status: state };
    } catch {
      return { status: 'disconnected' };
    }
  }

  async getQrCode(userId: string, instanceName: string) {
    await this.getOwnedInstance(userId, instanceName);
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      return res.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err?.response?.data?.message || 'Serviço Indisponível ou Credenciais Inválidas';
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  async updateSettings(userId: string, instanceName: string, data: { rejectCalls?: boolean; ignoreGroups?: boolean }) {
    await this.getOwnedInstance(userId, instanceName);
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      await axios.post(
        `${evoUrl}/settings/set/${instanceName}`,
        {
          rejectCall: data.rejectCalls,
          groupsIgnore: data.ignoreGroups,
        },
        { headers: { apikey: evoKey } },
      );
      return await this.prisma.instance.update({
        where: { name: instanceName },
        data: { rejectCalls: data.rejectCalls, ignoreGroups: data.ignoreGroups },
      });
    } catch {
      throw new HttpException('Erro ao atualizar settings', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string, actor: AuditActor, rawReason?: string) {
    const inst = await this.getOwnedInstance(actor.userId, instanceName);
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      await axios.delete(`${evoUrl}/instance/delete/${instanceName}`, { headers: { apikey: evoKey } });
    } catch (e) {
      this.logger.warn(`Instância ${instanceName} não pôde ser apagada na Evolution (Pode já não existir).`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.instance.delete({ where: { name: instanceName } });
      await this.deletionAudit.record(tx, actor, {
        resourceType: DeletionResourceType.INSTANCE,
        resourceId: instanceName,
        rawReason,
        snapshot: inst,
      });
    });
    return { success: true };
  }
}
