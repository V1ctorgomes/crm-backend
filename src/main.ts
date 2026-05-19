import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { assertProductionEnvOrThrow } from './config/assert-production-env';
import { securityHeadersMiddleware } from './config/security-headers.middleware';
import { selectiveJsonBodyMiddleware } from './config/webhook-body-limit.middleware';
import { SafeHttpExceptionFilter } from './config/http-exception.filter';
import { webhookRateLimitMiddleware } from './config/webhook-rate-limit.middleware';
import { csrfProtectionMiddleware, ensureCsrfCookieMiddleware } from './config/csrf';

async function bootstrap() {
  assertProductionEnvOrThrow();

  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : undefined,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app.use(securityHeadersMiddleware);
  app.use(webhookRateLimitMiddleware);
  app.use(cookieParser());
  app.use(ensureCsrfCookieMiddleware);
  app.use(csrfProtectionMiddleware);

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
    allowedHeaders:
      'Content-Type, Accept, Authorization, apikey, x-crm-webhook-secret, x-csrf-token, X-CSRF-Token',
    maxAge: 86400,
  });

  // Escuta na porta definida pelo ambiente (Easypanel/Heroku) ou 3001 localmente
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Servidor CRM rodando em: http://localhost:${port}`);
}

bootstrap();