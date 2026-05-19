import { UnauthorizedException } from '@nestjs/common';

/**
 * Valida segredo do webhook Evolution.
 * Em todos os ambientes exige `WHATSAPP_WEBHOOK_SECRET` configurado.
 * Em produção aceita apenas o header (não query string).
 */
export function assertWebhookAuthorized(
  secretHeader?: string,
  tokenQuery?: string,
): void {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!expected) {
    throw new UnauthorizedException(
      'Defina WHATSAPP_WEBHOOK_SECRET no servidor (mínimo 16 caracteres).',
    );
  }

  if (process.env.NODE_ENV === 'production') {
    if (tokenQuery) {
      throw new UnauthorizedException(
        'Em produção use apenas o header x-crm-webhook-secret (não ?token= na URL).',
      );
    }
    if (secretHeader !== expected) {
      throw new UnauthorizedException('Webhook não autorizado.');
    }
    return;
  }

  const ok = secretHeader === expected || tokenQuery === expected;
  if (!ok) {
    throw new UnauthorizedException('Webhook não autorizado.');
  }
}
