import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // CONFIGURAÇÃO DE LIMITE DE TAMANHO (CRUCIAL PARA ENVIO DE MÍDIA)
  // Definimos 20MB para aceitar os arquivos de até 15MB que o frontend envia
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ limit: '20mb', extended: true }));

  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
  const extraOrigins =
    process.env.FRONTEND_ORIGIN_EXTRA?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  const corsOrigins =
    frontendOrigin ? [frontendOrigin, ...extraOrigins] : true;

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, apikey, x-crm-webhook-secret',
  });

  // Escuta na porta definida pelo ambiente (Easypanel/Heroku) ou 3001 localmente
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Servidor CRM rodando em: http://localhost:${port}`);
}

bootstrap();