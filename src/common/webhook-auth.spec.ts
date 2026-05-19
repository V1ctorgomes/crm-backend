import { UnauthorizedException } from '@nestjs/common';
import { assertWebhookAuthorized } from './webhook-auth';

describe('webhook-auth', () => {
  const prev = process.env;

  beforeEach(() => {
    process.env = { ...prev, WHATSAPP_WEBHOOK_SECRET: 'test-secret-16chars' };
  });

  afterAll(() => {
    process.env = prev;
  });

  it('rejeita sem segredo configurado', () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    expect(() => assertWebhookAuthorized('x')).toThrow(UnauthorizedException);
  });

  it('aceita header em desenvolvimento', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertWebhookAuthorized('test-secret-16chars')).not.toThrow();
  });

  it('em produção só aceita header', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertWebhookAuthorized('test-secret-16chars', 'test-secret-16chars')).toThrow(
      UnauthorizedException,
    );
    expect(() => assertWebhookAuthorized('test-secret-16chars')).not.toThrow();
  });
});
