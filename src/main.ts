import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { assertProductionEnvOrThrow } from './config/assert-production-env';
import { securityHeadersMiddleware } from './config/security-headers.middleware';
import { selectiveJsonBodyMiddleware } from './config/webhook-body-limit.middleware';
import { SafeHttpExceptionFilter } from './config/http-exception.filter';
import { webhookRateLimitMiddleware } from './config/webhook-rate-limit.middleware';

async function bootstrap() {
  assertProductionEnvOrThrow();

  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : undefined,
  });

  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app.use(securityHeadersMiddleware);
  app.use(webhookRateLimitMiddleware);
  app.use(cookieParser());

  // Webhook: 2 MB; resto da API: 20 MB (mídia via multipart)
  app.use(selectiveJsonBodyMiddleware);
  app.use(urlencoded({ limit: '20mb', extended: true }));

  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
  const extraOrigins =
    process.env.FRONTEND_ORIGIN_EXTRA?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  if (!frontendOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_ORIGIN é obrigatório em produção.');
  }
  const corsOrigins = frontendOrigin ? [frontendOrigin, ...extraOrigins] : true;

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, apikey, x-crm-webhook-secret',
    maxAge: 86400,
  });

  // Escuta na porta definida pelo ambiente (Easypanel/Heroku) ou 3001 localmente
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Servidor CRM rodando em: http://localhost:${port}`);
}

bootstrap();