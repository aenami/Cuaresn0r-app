import { expect } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Aplicación y rutas vigentes (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Estas pruebas verifican el enrutado real sin conectarse ni escribir en POS.
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('expone el estado público del servidor', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok', ts: expect.any(String) });
  });

  it.each([
    ['get', '/salon/tables'],
    ['get', '/salon/zones'],
    ['post', '/bakery/transferencias'],
    ['post', '/interarea/restaurante-panaderia'],
    ['get', '/bakery/recepciones'],
    ['get', '/bakery/cajas'],
    ['post', '/payroll/jornadas/marcar'],
    ['patch', '/payroll/jornadas/1/cerrar'],
    ['patch', '/payroll/jornadas/1/reabrir'],
    ['delete', '/payroll/jornadas/1/marcaciones/ultima'],
  ] as const)('retira %s %s', async (method, url) => {
    await request(app.getHttpServer())[method](url).expect(404);
  });

  it('mantiene protegidas las remisiones y los horarios completos', async () => {
    await request(app.getHttpServer())
      .post('/bakery/remisiones/lista')
      .expect(401);
    await request(app.getHttpServer())
      .post('/payroll/jornadas/horario')
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
