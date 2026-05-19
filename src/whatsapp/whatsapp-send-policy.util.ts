/** Janela deslizante para limite de envios por instância (ms). */
export const SEND_RATE_WINDOW_MS = 60_000;

const DEFAULT_MAX_PER_MINUTE = 25;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_MAX_MS = 30_000;
/** Intervalo mínimo entre envios na mesma instância (alinhado à Evolution ~1,2 s). */
const DEFAULT_MIN_INTERVAL_MS = 1500;

function readPositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isSendQueueEnabled(): boolean {
  const v = process.env.WHATSAPP_SEND_QUEUE_ENABLED?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off') return false;
  return true;
}

export function getSendMaxPerMinute(): number {
  return readPositiveInt('WHATSAPP_SEND_MAX_PER_MINUTE', DEFAULT_MAX_PER_MINUTE);
}

export function getSendMaxRetries(): number {
  return readPositiveInt('WHATSAPP_SEND_MAX_RETRIES', DEFAULT_MAX_RETRIES);
}

export function getSendBackoffBaseMs(): number {
  return readPositiveInt('WHATSAPP_SEND_BACKOFF_BASE_MS', DEFAULT_BACKOFF_BASE_MS);
}

export function getSendBackoffMaxMs(): number {
  return readPositiveInt('WHATSAPP_SEND_BACKOFF_MAX_MS', DEFAULT_BACKOFF_MAX_MS);
}

export function getSendMinIntervalMs(): number {
  return readPositiveInt('WHATSAPP_SEND_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS);
}

/** Espera exponencial entre tentativas (1ª retry = base, 2ª = 2× base, …). */
export function computeBackoffMs(attemptIndex: number): number {
  const base = getSendBackoffBaseMs();
  const max = getSendBackoffMaxMs();
  const exp = base * 2 ** Math.max(0, attemptIndex);
  return Math.min(exp, max);
}
