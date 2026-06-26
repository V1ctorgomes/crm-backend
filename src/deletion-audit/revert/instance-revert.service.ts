import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { buildEvolutionWebhookConfig } from '../../common/evolution-webhook.util';
import { decryptField, encryptField } from '../../common/field-crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { asObj } from './revert-snapshot.util';

@Injectable()
export class InstanceRevertService {
  private readonly logger = new Logger(InstanceRevertService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getEvolutionCredentials(): Promise<{ evoUrl: string; evoKey: string }> {
    const provider = await this.prisma.provider.findUnique({ where: { name: 'evolution' } });
    if (!provider?.baseUrl || !provider?.apiKey) {
      throw new HttpException(
        'Configurações da Evolution API não encontradas. Configure-as na página Developer.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      evoUrl: provider.baseUrl.replace(/\/$/, ''),
      evoKey: decryptField(provider.apiKey) ?? '',
    };
  }

  private evolutionErrorMessage(error: unknown): string {
    const err = error as { response?: { data?: { message?: unknown; error?: string } }; message?: string };
    const resData = err?.response?.data;
    if (resData?.message) {
      if (Array.isArray(resData.message)) {
        return resData.message
          .map((m: { message?: string } | string) =>
            typeof m === 'object' && m && 'message' in m ? String(m.message) : JSON.stringify(m),
          )
          .join(', ');
      }
      return String(resData.message);
    }
    return resData?.error || err?.message || 'Erro na Evolution API';
  }

  /**
   * Recria a instância na Evolution (como em InstancesService.create) e depois o registo em BD.
   * Se a gravação na BD falhar após sucesso na Evolution, tenta apagar de novo na Evolution.
   */
  async revertInstanceWithEvolution(
    snapshot: Prisma.JsonValue,
    auditId: string,
    adminUserId: string,
  ): Promise<void> {
    const s = asObj(snapshot);
    if (!s) throw new HttpException('Cópia da instância inválida.', HttpStatus.BAD_REQUEST);
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    const userId = typeof s.userId === 'string' ? s.userId : '';
    if (!name || !userId) {
      throw new HttpException('Cópia da instância incompleta (nome ou utilizador).', HttpStatus.BAD_REQUEST);
    }

    const dup = await this.prisma.instance.findUnique({
      where: { name },
      select: { name: true },
    });
    if (dup) {
      throw new HttpException('Já existe uma instância com este nome no CRM.', HttpStatus.CONFLICT);
    }

    const rejectCalls = Boolean(s.rejectCalls);
    const ignoreGroups = Boolean(s.ignoreGroups);
    const proxyHost = s.proxyHost == null ? null : String(s.proxyHost).trim() || null;
    const proxyPort = s.proxyPort == null ? null : String(s.proxyPort).trim() || null;
    const proxyUser = s.proxyUser == null ? null : String(s.proxyUser).trim() || null;
    const proxyPassRaw = s.proxyPass == null ? null : String(s.proxyPass).trim() || null;
    const proxyPass = proxyPassRaw ? decryptField(proxyPassRaw) : null;
    const proxyProto = (s.proxyProto == null ? 'http' : String(s.proxyProto)).toLowerCase().trim() || 'http';

    const { evoUrl, evoKey } = await this.getEvolutionCredentials();
    const evoHeaders = { apikey: evoKey };

    let evolutionCreated = false;
    try {
      await axios.post(
        `${evoUrl}/instance/create`,
        { instanceName: name, qrcode: false, integration: 'WHATSAPP-BAILEYS' },
        { headers: evoHeaders },
      );
      evolutionCreated = true;

      if (proxyHost && proxyPort) {
        const proxySetPayload: Record<string, string | boolean> = {
          enabled: true,
          host: proxyHost,
          port: proxyPort,
          protocol: proxyProto,
        };
        if (proxyUser && proxyPass) {
          proxySetPayload.username = proxyUser;
          proxySetPayload.password = proxyPass;
        }
        try {
          await axios.post(`${evoUrl}/proxy/set/${name}`, proxySetPayload, {
            headers: { 'Content-Type': 'application/json', ...evoHeaders },
          });
        } catch (proxyErr) {
          await axios.delete(`${evoUrl}/instance/delete/${name}`, { headers: evoHeaders }).catch(() => undefined);
          evolutionCreated = false;
          throw new HttpException(
            `A Evolution rejeitou o proxy ao restaurar: ${this.evolutionErrorMessage(proxyErr)}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const webhook = buildEvolutionWebhookConfig();
      if (webhook) {
        await new Promise((r) => setTimeout(r, 1500));
        await axios
          .post(`${evoUrl}/webhook/set/${name}`, { webhook }, { headers: { 'Content-Type': 'application/json', ...evoHeaders } })
          .catch((e) => this.logger.warn(`Webhook ao restaurar instância (ignorado): ${String(e)}`));
      }

      try {
        await axios.post(
          `${evoUrl}/settings/set/${name}`,
          { rejectCall: rejectCalls, groupsIgnore: ignoreGroups },
          { headers: { 'Content-Type': 'application/json', ...evoHeaders } },
        );
      } catch (e) {
        this.logger.warn(`settings/set ao restaurar ${name}: ${this.evolutionErrorMessage(e)}`);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.instance.create({
          data: {
            name,
            userId,
            status: 'disconnected',
            rejectCalls,
            ignoreGroups,
            proxyHost,
            proxyPort,
            proxyUser,
            proxyPass: proxyPass ? encryptField(proxyPass) : null,
            proxyProto,
          },
        });
        await tx.deletionAudit.update({
          where: { id: auditId },
          data: { revertedAt: new Date(), revertedByUserId: adminUserId },
        });
      });
    } catch (e) {
      if (e instanceof HttpException) {
        if (evolutionCreated) {
          await axios.delete(`${evoUrl}/instance/delete/${name}`, { headers: evoHeaders }).catch(() => undefined);
        }
        throw e;
      }
      if (evolutionCreated) {
        await axios.delete(`${evoUrl}/instance/delete/${name}`, { headers: evoHeaders }).catch(() => undefined);
      }
      this.logger.warn(`Falha ao restaurar instância ${name}: ${String(e)}`);
      throw new HttpException(this.evolutionErrorMessage(e), HttpStatus.BAD_REQUEST);
    }
  }
}
