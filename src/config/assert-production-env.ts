const MIN_JWT_SECRET_LEN = 32;

/**
 * Em produção exige segredo JWT forte e origem do frontend (CORS).
 * Chamar no início de `main.ts`, antes de `NestFactory.create`.
 */
export function assertProductionEnvOrThrow(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt || jwt.length < MIN_JWT_SECRET_LEN) {
    throw new Error(
      `Em produção defina JWT_SECRET com pelo menos ${MIN_JWT_SECRET_LEN} caracteres (ex.: openssl rand -base64 48).`,
    );
  }

  const origin = process.env.FRONTEND_ORIGIN?.trim();
  if (!origin) {
    throw new Error(
      'Em produção defina FRONTEND_ORIGIN (URL do frontend, ex.: https://app.exemplo.com).',
    );
  }

  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
  if (!webhookSecret || webhookSecret.length < 16) {
    throw new Error(
      'Em produção defina WHATSAPP_WEBHOOK_SECRET com pelo menos 16 caracteres (webhook Evolution).',
    );
  }

  const weakJwtPatterns = ['change-me', 'secret', 'password', 'crm-dev-jwt'];
  if (weakJwtPatterns.some((p) => jwt!.toLowerCase().includes(p))) {
    throw new Error('JWT_SECRET em produção não pode conter valores previsíveis ou de exemplo.');
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Em produção defina DATABASE_URL.');
  }

  const fieldKey = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!fieldKey || fieldKey.length < 32) {
    throw new Error(
      'Em produção defina FIELD_ENCRYPTION_KEY com pelo menos 32 caracteres (ex.: openssl rand -base64 48).',
    );
  }
}
