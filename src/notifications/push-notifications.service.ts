import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type PushSubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject =
      process.env.VAPID_SUBJECT?.trim() || 'mailto:noreply@localhost';
    if (publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('Web Push (VAPID) configurado.');
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY em falta — push desativado.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.VAPID_PUBLIC_KEY?.trim() &&
        process.env.VAPID_PRIVATE_KEY?.trim(),
    );
  }

  async saveSubscription(
    userId: string,
    body: PushSubscribeBody,
    userAgent?: string | null,
  ) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: body.endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Este endpoint push já pertence a outra conta.');
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: userAgent ?? null,
      },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: userAgent ?? null,
      },
    });
  }

  async removeByEndpoint(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async removeAllForUser(userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId } });
  }

  async notifyWhatsappInbound(
    userId: string,
    opts: { contactName: string; contactNumber: string; preview: string },
  ) {
    if (!this.isConfigured()) return;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (!subs.length) return;

    const payload = JSON.stringify({
      title: `WhatsApp — ${opts.contactName}`,
      body: opts.preview || 'Nova mensagem',
      url: '/whatsapp',
      tag: `crm-wa-${opts.contactNumber}`,
    });

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
            { TTL: 3600 },
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { endpoint: s.endpoint } })
              .catch(() => undefined);
          } else {
            this.logger.warn(
              `Push falhou (${status}): ${(err as Error)?.message ?? err}`,
            );
          }
        }
      }),
    );
  }
}
