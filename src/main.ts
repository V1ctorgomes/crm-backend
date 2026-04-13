import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilita o CORS para permitir que o Frontend acesse a API
  app.enableCors({
    origin: '*', // Em produção, você substituirá pelo domínio do seu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(3001);
  console.log(`Application is running on: http://localhost:3001`);
}
bootstrap();