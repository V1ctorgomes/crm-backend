export function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function unwrapProtoMessage(message: unknown): Record<string, unknown> {
  let cur = asObj(message) || {};
  for (let depth = 0; depth < 8; depth++) {
    const vm = asObj(cur.viewOnceMessage);
    const vm2 = asObj(cur.viewOnceMessageV2);
    const ep = asObj(cur.ephemeralMessage);
    const dwc = asObj(cur.documentWithCaptionMessage);
    const fp = asObj(cur.futureProofMessage);
    const next =
      (vm && asObj(vm.message)) ||
      (vm2 && asObj(vm2.message)) ||
      (ep && asObj(ep.message)) ||
      (dwc && asObj(dwc.message)) ||
      (fp && asObj(fp.message));
    if (!next || Object.keys(next).length === 0) break;
    cur = next;
  }
  return cur;
}

/** Número, string numérica, ou objeto estilo protobufjs Long `{ low, high }` (timestamps WA). */
export function toFiniteNumber(u: unknown): number | null {
  if (typeof u === 'number' && Number.isFinite(u)) return u;
  if (typeof u === 'string' && u.trim() !== '') {
    const n = Number(u);
    return Number.isFinite(n) ? n : null;
  }
  const o = asObj(u);
  if (o && typeof o.low === 'number') {
    const low = o.low >>> 0;
    const high = typeof o.high === 'number' ? o.high | 0 : 0;
    const sum = high * 0x100000000 + low;
    return Number.isFinite(sum) ? sum : null;
  }
  return null;
}

/** Segundos ou milissegundos Unix → Date */
export function normalizeWhatsAppTime(u: unknown): Date | null {
  const n = toFiniteNumber(u);
  if (n == null || n <= 0) return null;
  const ms = n < 1e11 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}
