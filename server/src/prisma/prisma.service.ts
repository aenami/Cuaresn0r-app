import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

function obtenerCadenaConexion(): string {
  const cadenaConexion = process.env.DATABASE_URL;

  if (typeof cadenaConexion !== 'string' || cadenaConexion.trim() === '') {
    throw new Error(
      'Falta DATABASE_URL. Crea el archivo server/.env a partir de server/.env.example y configura las credenciales de PostgreSQL.',
    );
  }

  return cadenaConexion;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: obtenerCadenaConexion() }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
