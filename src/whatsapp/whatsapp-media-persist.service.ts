import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildScopedMessageId,
  isGroupRemoteJid,
} from './whatsapp-contact-jid.util';
import { WhatsappGroupSubjectService } from './whatsapp-group-subject.service';

@Injectable()
export class WhatsappMediaPersistService {
  private readonly logger = new Logger(WhatsappMediaPersistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupSubjectService: WhatsappGroupSubjectService,
  ) {}

  async persistSentMedia(params: {
    userId: string;
    instanceName: string;
    contactKey: string;
    waId: string;
    safeCaption: string;
    fallbackText: string;
    mediaUrl: string;
    fileMimeType: string;
    fileOriginalName: string;
  }) {
    const {
      userId,
      instanceName,
      contactKey,
      waId,
      safeCaption,
      fallbackText,
      mediaUrl,
      fileMimeType,
      fileOriginalName,
    } = params;

    let createDisplayNameMedia: string | undefined;
    if (isGroupRemoteJid(contactKey)) {
      createDisplayNameMedia =
        (await this.groupSubjectService.tryFetchGroupSubject(instanceName, contactKey, { retries: 1 })) ||
        'Grupo WhatsApp';
    }

    await this.prisma.contact.upsert({
      where: { number_userId: { number: contactKey, userId } },
      update: { lastMessage: safeCaption || fallbackText, lastMessageTime: new Date(), instanceName },
      create: {
        number: contactKey,
        userId,
        name: createDisplayNameMedia ?? contactKey,
        lastMessage: safeCaption || fallbackText,
        instanceName,
      },
    });

    const scopedId = buildScopedMessageId(userId, String(waId));
    try {
      await this.prisma.message.create({
        data: {
          id: scopedId,
          userId,
          instanceName,
          contactNumber: contactKey,
          text: safeCaption,
          type: 'sent',
          isMedia: true,
          mediaData: mediaUrl,
          mimeType: fileMimeType,
          fileName: fileOriginalName,
          timestamp: new Date(),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        this.logger.warn(`create mídia duplicada ignorada: ${scopedId}`);
      } else {
        throw e;
      }
    }

    return scopedId;
  }
}
