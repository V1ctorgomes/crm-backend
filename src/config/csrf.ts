import { randomBytes } from 'crypto';
import type { CookieOptions, Request, Response, NextFunction } from 'express';

export const CSRF_COOKIE = 'crm_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function csrfCookieOptions(maxAgeMs?: number): CookieOptions {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
    ...(domain ? { domain } : {}),
  };
}

/** Garante cookie CSRF quando existe sessão (ex.: refresh com token HttpOnly). */
export function ensureCsrfCookieMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.cookies?.token && !req.cookies?.[CSRF_COOKIE]) {
    const maxAgeMs = 8 * 60 * 60 * 1000;
    res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(maxAgeMs));
  }
  next();
}

function isCsrfExemptPath(path: string): boolean {
  return (
    /\/auth\/(login|register|request-password-reset|logout)(\?|$)/i.test(path) ||
    /\/whatsapp\/webhook(\?|$)/i.test(path) ||
    /\/notifications\/push\/vapid-public-key(\?|$)/i.test(path) ||
    path === '/health' ||
    path === '/'
  );
}

/** Exige header alinhado com cookie em pedidos que alteram estado com sessão por cookie. */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    next();
    return;
  }

  const path = (req.path || req.url || '').split('?')[0];
  if (isCsrfExemptPath(path)) {
    next();
    return;
  }

  if (!req.cookies?.token) {
    next();
    return;
  }

  const cookieToken = String(req.cookies[CSRF_COOKIE] ?? '');
  const headerToken = String(req.headers[CSRF_HEADER] ?? req.headers['X-CSRF-Token'] ?? '');
  if (!cookieToken || cookieToken !== headerToken) {
    res.status(403).json({
      statusCode: 403,
      message: 'Pedido recusado por proteção CSRF. Inicie sessão novamente.',
    });
    return;
  }
  next();
}

export function setCsrfCookie(res: Response, maxAgeMs: number): void {
  res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions(maxAgeMs));
}

export function clearCsrfCookie(res: Response): void {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  res.clearCookie(CSRF_COOKIE, {
    path: '/',
    ...(domain ? { domain } : {}),
  });
}
