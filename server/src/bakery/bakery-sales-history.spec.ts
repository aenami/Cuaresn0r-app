import { BadRequestException } from '@nestjs/common';
import { BakeryController } from './bakery.controller';
import { BakeryService } from './bakery.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Cuentas cobradas de panadería', () => {
  const listarVentas = jest.fn();
  const controller = new BakeryController({
    listarVentas,
  } as unknown as BakeryService);
  beforeEach(() => jest.clearAllMocks());

  it('acepta fecha y turno opcionales', () => {
    controller.listarVentas('12', '2026-10-09');
    expect(listarVentas).toHaveBeenCalledWith(12, '2026-10-09');
    controller.listarVentas();
    expect(listarVentas).toHaveBeenLastCalledWith(undefined, undefined);
  });
  it.each(['2026-02-30', '2026-2-01', '', 'no-fecha'])(
    'rechaza fecha inválida %s',
    (fecha) => {
      expect(() => controller.listarVentas(undefined, fecha)).toThrow(
        BadRequestException,
      );
      expect(listarVentas).not.toHaveBeenCalled();
    },
  );
  it.each(['0', '-1', '1.5', 'abc', '', '9007199254740992'])(
    'rechaza turno inválido %s',
    (turno) => {
      expect(() => controller.listarVentas(turno)).toThrow(BadRequestException);
    },
  );

  it('consulta el día completo en Colombia sin truncarlo a las últimas 100 ventas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BakeryService({
      ventaPanaderia: { findMany },
    } as unknown as PrismaService);
    await service.listarVentas(12, '2026-10-09');
    const consulta = findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({
      turnoId: 12,
      turno: { caja: { area: 'PANADERIA' } },
      fecha: {
        gte: new Date('2026-10-09T05:00:00Z'),
        lt: new Date('2026-10-10T05:00:00Z'),
      },
    });
    expect(consulta.take).toBeUndefined();
    expect(consulta.include.turno.select.usuario).toBeDefined();
    await service.listarVentas();
    expect(findMany.mock.calls[1][0].take).toBe(100);
  });
});
