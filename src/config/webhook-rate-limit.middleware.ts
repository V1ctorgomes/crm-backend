import type { Request, Response, NextFunction } from 'express';
import { HttpException, HttpStatus } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Limite por IP no webhook (independente do Throttler global). */
export function webhookRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'POST' || !/\/whatsapp\/webhook\/?$/i.test(req.path)) {
    next();
    return;
  }

  const ip = clientIp(req);
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    throw new HttpException('Demasiados pedidos ao webhook.', HttpStatus.TOO_MANY_REQUESTS);
  }
  next();
}
