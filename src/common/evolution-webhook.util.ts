export const EVOLUTION_WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONNECTION_UPDATE',
] as const;

export type EvolutionWebhookConfig = {
  enabled: true;
  url: string;
  byEvents: false;
  base64: false;
  events: string[];
  headers?: Record<string, string>;
};

/** Normaliza eventos Evolution (`MESSAGES_UPSERT` → `messages.upsert`). */
export function normalizeWebhookEvent(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '.');
}

/**
 * Monta webhook para a Evolution.
 * Em produção: URL limpa + header `x-crm-webhook-secret` (query `?token=` é rejeitada pelo CRM).
 * Em desenvolvimento: mantém `?token=` se não houver header configurado na Evolution.
 */
export function buildEvolutionWebhookConfig(): EvolutionWebhookConfig | null {
  const rawBase = process.env.WEBHOOK_URL?.trim();
  if (!rawBase) return null;

  const secret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  const url = rawBase.replace(/[?&]token=[^&]*/gi, '').replace(/\?$/, '');

  const webhook: EvolutionWebhookConfig = {
    enabled: true,
    url,
    byEvents: false,
    base64: false,
    events: [...EVOLUTION_WEBHOOK_EVENTS],
  };

  if (secret) {
    if (isProd) {
      webhook.headers = { 'x-crm-webhook-secret': secret };
    } else {
      const sep = url.includes('?') ? '&' : '?';
      webhook.url = `${url}${sep}token=${encodeURIComponent(secret)}`;
    }
  }

  return webhook;
}
