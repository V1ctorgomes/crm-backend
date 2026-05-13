/** Fallback apenas para desenvolvimento (nunca usar em produção). */
const DEV_JWT_FALLBACK =
  'crm-dev-jwt-secret-min-32-chars-do-not-use-in-production________';

/**
 * Segredo para assinar/validar JWT. Em produção `assertProductionEnvOrThrow` já garantiu JWT_SECRET.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET em falta após validação de ambiente.');
  }
  return DEV_JWT_FALLBACK;
}
