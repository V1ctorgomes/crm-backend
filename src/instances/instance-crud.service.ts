import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { DeletionAuditService } from '../deletion-audit/deletion-audit.service';
import { DeletionResourceType } from '../deletion-audit/deletion-audit.constants';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { maskSecret } from '../common/mask-secret';
import { InstanceEvolutionSyncService } from './instance-evolution-sync.service';
import { InstanceCreateService } from './instance-create.service';

@Injectable()
export class InstanceCrudService {
  private readonly logger = new Logger(InstanceCrudService.name);

  constructor(
    private prisma: PrismaService,
    private deletionAudit: DeletionAuditService,
    private evolutionSync: InstanceEvolutionSyncService,
    private createService: InstanceCreateService,
  ) {}

  async findAll() {
    const instances = await this.prisma.instance.findMany({ orderBy: { createdAt: 'desc' } });

    try {
      await Promise.allSettled(instances.map((inst) => this.checkStatus(inst.name)));
    } catch (e) {
      this.logger.warn('Não foi possível verificar o status das instâncias. Verifique as credenciais da API.');
    }

    const rows = await this.prisma.instance.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      ...row,
      proxyPass: row.proxyPass ? maskSecret(row.proxyPass) : null,
    }));
  }

  create(userId: string, data: Record<string, unknown>) {
    return this.createService.create(userId, data);
  }

  async checkStatus(instanceName: string) {
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: { apikey: evoKey } });
      const state = res.data?.instance?.state === 'open' ? 'connected' : 'disconnected';
      await this.prisma.instance.update({ where: { name: instanceName }, data: { status: state } });
      return { status: state };
    } catch (e) {
      return { status: 'disconnected' };
    }
  }

  async getQrCode(instanceName: string) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName } });
    try {
      const { evoUrl, evoKey } = await this.evolutionSync.getEvolutionCredentials();
      const res = await axios.get(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      return res.data;
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Serviço Indisponível ou Credenciais Inválidas';
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  async updateSettings(instanceName: string, data: any) {
    await this.prisma.instance.findFirstOrThrow({ where: { name: instanceName } });
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
    } catch (e) {
      throw new HttpException('Erro ao atualizar settings', HttpStatus.BAD_REQUEST);
    }
  }

  async remove(instanceName: string, actor: AuditActor, rawReason?: string) {
    const inst = await this.prisma.instance.findFirst({ where: { name: instanceName } });
    if (!inst) {
      throw new HttpException('Instância não encontrada.', HttpStatus.NOT_FOUND);
    }
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
