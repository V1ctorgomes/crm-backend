// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // LIBERA A CONEXÃO PARA O FRONTEND (Evita o erro de CORS)
  app.enableCors({
    origin: '*', // Em produção super restrita, coloque aqui o link exato do seu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Servidor CRM rodando na porta: ${port}`);
}
bootstrap();