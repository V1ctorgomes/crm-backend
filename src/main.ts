import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CONFIGURAÇÃO DE LIMITE DE TAMANHO (CRUCIAL PARA ENVIO DE MÍDIA)
  // Definimos 20MB para aceitar os arquivos de até 15MB que o frontend envia
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ limit: '20mb', extended: true }));

  // Habilita o CORS para que o seu Frontend (Next.js) consiga comunicar com o Backend
  app.enableCors({
    origin: '*', // Em produção, você pode substituir pelo domínio real do seu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Escuta na porta definida pelo ambiente (Easypanel/Heroku) ou 3001 localmente
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Servidor CRM rodando em: http://localhost:${port}`);
}

bootstrap();