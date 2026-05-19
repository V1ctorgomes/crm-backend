/** Erros da Evolution em que convém esperar e tentar de novo. */
export function isEvolutionRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { response?: { status?: number; data?: unknown }; message?: string };
  const status = e.response?.status;
  if (status === 429 || status === 503 || status === 502) return true;
  const blob = JSON.stringify(e.response?.data ?? e.message ?? '').toLowerCase();
  return /rate.?limit|too many requests|temporarily unavailable|overloaded|econnreset|socket hang up/.test(
    blob,
  );
}

export function evolutionErrorDetail(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Erro desconhecido';
  const e = err as {
    response?: { data?: { message?: unknown; error?: unknown } };
    message?: string;
  };
  const data = e.response?.data;
  if (data) {
    if (typeof data.message === 'string') return data.message;
    if (Array.isArray(data.message)) {
      return data.message.map((m: unknown) => String(m)).join(', ');
    }
    if (typeof data.error === 'string') return data.error;
  }
  return e.message || 'Erro na Evolution API';
}
