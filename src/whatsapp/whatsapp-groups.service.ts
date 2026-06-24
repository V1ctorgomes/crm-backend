import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import { WhatsappInstanceResolverService } from './whatsapp-instance-resolver.service';
import { WhatsappProfileService } from './whatsapp-profile.service';
import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';
import { isGroupRemoteJid, normalizeStoredContactKey } from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappGroupsService {
  private readonly logger = new Logger(WhatsappGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly instanceResolver: WhatsappInstanceResolverService,
    private readonly profileService: WhatsappProfileService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
  ) {}

  async createGroup(
    userId: string,
    body: { subject: string; participants: string[]; description?: string; instanceName?: string },
  ) {
    const subject = String(body.subject || '').trim();
    if (!subject) {
      throw new HttpException('Indique o nome do grupo.', HttpStatus.BAD_REQUEST);
    }
    if (subject.length > 25) {
      throw new HttpException('O nome do grupo tem no máximo 25 caracteres no WhatsApp.', HttpStatus.BAD_REQUEST);
    }
    const participants = (Array.isArray(body.participants) ? body.participants : [])
      .map((p) => String(p || '').replace(/\D/g, ''))
      .filter((d) => d.length >= 10);
    if (participants.length < 1) {
      throw new HttpException(
        'Indique pelo menos um número com WhatsApp (DDI + DDD + número, só dígitos) para criar o grupo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const instanceName = body.instanceName?.trim() || (await this.instanceResolver.getDefaultInstanceName(userId));
    await this.instanceResolver.assertInstanceExists(instanceName);

    const { baseUrl, apiKey } = await this.creds.get();
    const payload: Record<string, unknown> = { subject, participants };
    const desc = String(body.description || '').trim();
    if (desc) payload.description = desc;

    let res;
    try {
      res = await axios.post(`${baseUrl}/group/create/${encodeURIComponent(instanceName)}`, payload, {
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      const detail =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Falha ao criar grupo na Evolution.';
      this.logger.warn(`createGroup Evolution: ${detail}`);
      throw new HttpException(String(detail), HttpStatus.BAD_REQUEST);
    }

    const d = res.data || {};
    const jidRaw = d.jid || d.groupJid || d.key?.remoteJid || d.id;
    const jidNorm = jidRaw ? String(jidRaw).trim() : '';
    const jid = jidNorm ? normalizeStoredContactKey(jidNorm) : '';
    if (!jid.toLowerCase().includes('@g.us')) {
      this.logger.warn('createGroup resposta inesperada', d);
      throw new HttpException(
        'A Evolution não devolveu o identificador do grupo. Verifique a versão da API e os logs.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.contact.upsert({
      where: { number_userId: { number: jid, userId } },
      update: {
        name: subject,
        lastMessage: 'Grupo criado',
        lastMessageTime: new Date(),
        instanceName,
      },
      create: {
        userId,
        number: jid,
        name: subject,
        lastMessage: 'Grupo criado',
        lastMessageTime: new Date(),
        instanceName,
      },
    });

    return { groupJid: jid, subject };
  }

  async syncGroupProfileFromWhatsApp(
    userId: string,
    body: { number: string; instanceName?: string },
  ) {
    const contactKey = normalizeStoredContactKey(String(body.number || '').trim());
    if (!isGroupRemoteJid(contactKey)) {
      throw new HttpException(
        'Só é possível sincronizar foto/nome para grupos WhatsApp (@g.us).',
        HttpStatus.BAD_REQUEST,
      );
    }
    const instanceName = body.instanceName?.trim() || (await this.instanceResolver.getDefaultInstanceName(userId));
    await this.instanceResolver.assertInstanceExists(instanceName);

    const existing = await this.prisma.contact.findUnique({
      where: { number_userId: { number: contactKey, userId } },
    });
    if (!existing) {
      throw new HttpException(
        'Contato de grupo não encontrado. Abra a conversa ou aguarde uma mensagem.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [picUrl, subjectFromApi] = await Promise.all([
      this.profileService.fetchProfilePicture(contactKey, instanceName),
      this.groupSubjectService.tryFetchGroupSubject(instanceName, contactKey, { retries: 2 }),
    ]);

    const data: { profilePictureUrl?: string | null; name?: string } = {};
    if (picUrl) data.profilePictureUrl = picUrl;
    if (
      subjectFromApi &&
      this.groupSubjectService.shouldReplaceAutoGroupDisplayName(existing.name, contactKey)
    ) {
      data.name = subjectFromApi;
    }

    if (Object.keys(data).length === 0) {
      return {
        number: existing.number,
        name: existing.name,
        profilePictureUrl: existing.profilePictureUrl,
        updated: false as const,
      };
    }

    const updated = await this.prisma.contact.update({
      where: { number_userId: { number: contactKey, userId } },
      data,
    });
    return {
      number: updated.number,
      name: updated.name,
      profilePictureUrl: updated.profilePictureUrl,
      updated: true as const,
    };
  }
}
