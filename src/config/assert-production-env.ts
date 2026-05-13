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
}
