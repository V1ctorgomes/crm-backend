import { buildEvolutionWebhookConfig, normalizeWebhookEvent } from './evolution-webhook.util';

describe('evolution-webhook.util', () => {
  const prev = process.env;

  beforeEach(() => {
    process.env = { ...prev };
    process.env.WEBHOOK_URL = 'https://crm.example.com/whatsapp/webhook';
    process.env.WHATSAPP_WEBHOOK_SECRET = 'test-secret-16chars';
  });

  afterEach(() => {
    process.env = prev;
  });

  it('normaliza eventos da Evolution', () => {
    expect(normalizeWebhookEvent('MESSAGES_UPSERT')).toBe('messages.upsert');
    expect(normalizeWebhookEvent('send.message')).toBe('send.message');
  });

  it('em produção usa header e URL sem token', () => {
    process.env.NODE_ENV = 'production';
    const cfg = buildEvolutionWebhookConfig();
    expect(cfg?.url).toBe('https://crm.example.com/whatsapp/webhook');
    expect(cfg?.headers).toEqual({ 'x-crm-webhook-secret': 'test-secret-16chars' });
  });

  it('em desenvolvimento anexa token na URL', () => {
    process.env.NODE_ENV = 'development';
    const cfg = buildEvolutionWebhookConfig();
    expect(cfg?.url).toContain('token=test-secret-16chars');
    expect(cfg?.headers).toBeUndefined();
  });
});
