import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DIR_UPLOADS, PREFIJO_UPLOADS } from './common/uploads';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // En produccion se restringe a los dominios de CORS_ORIGIN (lista separada
  // por comas, p. ej. el dominio de Vercel). Sin la variable (dev) se refleja
  // el origen de la peticion, equivalente a abrir CORS.
  const origenesCors = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: origenesCors ? origenesCors.split(',').map((o) => o.trim()) : true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));

  // Imagenes de productos subidas por el usuario, servidas de forma estatica.
  // El middleware estatico corre antes del router de Nest, asi que estas rutas
  // no pasan por los guards JWT (las imagenes no son sensibles y un <img> no
  // puede enviar el header Authorization).
  app.useStaticAssets(DIR_UPLOADS, { prefix: PREFIJO_UPLOADS });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
