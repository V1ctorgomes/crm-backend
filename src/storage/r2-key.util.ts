import type { R2ResolvedConfig } from './r2-config.service';

/** Extrai a object key S3/R2 a partir da URL pública gravada na BD. */
export function objectKeyFromPublicUrl(fileUrl: string, cfg: R2ResolvedConfig): string | null {
  try {
    const url = new URL(fileUrl);
    const base = new URL(cfg.publicUrl.endsWith('/') ? cfg.publicUrl : `${cfg.publicUrl}/`);
    if (url.origin !== base.origin) return null;
    const key = url.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    return null;
  }
}
