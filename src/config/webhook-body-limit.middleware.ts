import type { Request, Response, NextFunction } from 'express';
import { json } from 'express';

const webhookJson = json({ limit: '2mb' });
const apiJson = json({ limit: '20mb' });

/** Escolhe limite de body conforme rota (webhook vs resto da API). */
export function selectiveJsonBodyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isWebhook =
    req.method === 'POST' && /\/whatsapp\/webhook\/?$/i.test(req.path);
  if (isWebhook) {
    return webhookJson(req, res, next);
  }
  return apiJson(req, res, next);
}
