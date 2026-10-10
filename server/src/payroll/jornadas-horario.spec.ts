import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JornadasService } from './jornadas.service';
import { PrismaService } from '../prisma/prisma.service';
import { NominaConfigService } from './nomina-config.service';
import { accessContext } from '../auth/access-context';
import { AuthTokenPayload } from '../common/token/token.service';

const entrada = new Date('2026-10-07T07:00:00-05:00');
const salida = new Date('2026-10-07T12:00:00-05:00');
const fecha = new Date('2026-10-07T00:00:00Z');
const solicitud = {
  idEmpleado: 1,
  fecha: '2026-10-07',
  tramos: [{ entrada: entrada.toISOString(), salida: salida.toISOString() }],
};

describe('Confirmar horario de forma atómica', () => {
  const crearJornada = (estado = 'ABIERTA') => ({
    id_jornada: 10,
    id_empleado_jornada: 1,
    fecha_jornada: fecha,
    estado_jornada: estado,
    marcaciones: [
      { tipo_marcacion: 'ENTRADA', fecha_hora_marcacion: entrada },
      { tipo_marcacion: 'SALIDA', fecha_hora_marcacion: salida },
    ],
  });
  function preparar() {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ estado_empleado: 'ACTIVO', id_jornada: 10 }]),
      jornada: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(crearJornada()),
        create: jest.fn().mockResolvedValue(crearJornada()),
      },
      marcacion: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      empleado: {
        findUnique: jest.fn().mockResolvedValue({ area: 'RESTAURANTE' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const service = new JornadasService(
      prisma as unknown as PrismaService,
      {} as NominaConfigService,
    );
    const internas = service as unknown as {
      liquidar: (t: unknown, id: number) => Promise<unknown>;
      reabrirEnTransaccion: (t: unknown, id: number) => Promise<unknown>;
    };
    const liquidar = jest
      .spyOn(internas, 'liquidar')
      .mockResolvedValue({ jornada: crearJornada('CERRADA') });
    const reabrir = jest
      .spyOn(internas, 'reabrirEnTransaccion')
      .mockResolvedValue({});
    return { tx, prisma, service, liquidar, reabrir };
  }
  it('crea todos los pares y liquida dentro de la misma transacción', async () => {
    const { tx, service, liquidar } = preparar();
    await service.registrarHorario(solicitud);
    expect(tx.marcacion.createMany).toHaveBeenCalledWith({
      data: [
        {
          id_jornada_marcacion: 10,
          tipo_marcacion: 'ENTRADA',
          fecha_hora_marcacion: entrada,
        },
        {
          id_jornada_marcacion: 10,
          tipo_marcacion: 'SALIDA',
          fecha_hora_marcacion: salida,
        },
      ],
    });
    expect(liquidar).toHaveBeenCalledWith(tx, 10);
  });
  it('completa una jornada antigua abierta sin duplicarla', async () => {
    const { tx, service } = preparar();
    tx.jornada.findMany.mockResolvedValue([crearJornada()]);
    await service.registrarHorario({ ...solicitud, idJornada: 10 });
    expect(tx.jornada.create).not.toHaveBeenCalled();
    expect(tx.marcacion.deleteMany).toHaveBeenCalledWith({
      where: { id_jornada_marcacion: 10 },
    });
  });
  it('un reintento idéntico no duplica ni recalcula devengos', async () => {
    const { tx, service, liquidar } = preparar();
    tx.jornada.findMany.mockResolvedValue([crearJornada('CERRADA')]);
    tx.jornada.findUniqueOrThrow.mockResolvedValue(crearJornada('CERRADA'));
    await service.registrarHorario(solicitud);
    expect(liquidar).not.toHaveBeenCalled();
    expect(tx.marcacion.deleteMany).not.toHaveBeenCalled();
    expect(tx.marcacion.createMany).not.toHaveBeenCalled();
  });
  it('reutiliza las reglas de reapertura solo al corregir explícitamente', async () => {
    const { tx, service, reabrir, liquidar } = preparar();
    tx.jornada.findMany.mockResolvedValue([crearJornada('CERRADA')]);
    tx.jornada.findUniqueOrThrow.mockResolvedValue(crearJornada('CERRADA'));
    await service.registrarHorario({
      ...solicitud,
      idJornada: 10,
      tramos: [
        {
          entrada: entrada.toISOString(),
          salida: new Date(salida.getTime() + 3600000).toISOString(),
        },
      ],
    });
    expect(reabrir).toHaveBeenCalledWith(tx, 10);
    expect(liquidar).toHaveBeenCalledWith(tx, 10);
  });
  it('si ya hay pagos, no modifica las horas', async () => {
    const { tx, service, reabrir, liquidar } = preparar();
    tx.jornada.findMany.mockResolvedValue([crearJornada('CERRADA')]);
    tx.jornada.findUniqueOrThrow.mockResolvedValue(crearJornada('CERRADA'));
    reabrir.mockRejectedValue(
      new ConflictException('Devengos con pagos aplicados'),
    );
    await expect(
      service.registrarHorario({
        ...solicitud,
        idJornada: 10,
        tramos: [
          {
            entrada: entrada.toISOString(),
            salida: new Date(salida.getTime() + 3600000).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow(/pagos/);
    expect(tx.marcacion.deleteMany).not.toHaveBeenCalled();
    expect(liquidar).not.toHaveBeenCalled();
  });
  it('no sobreescribe una jornada cerrada desde Registrar nuevo', async () => {
    const { tx, service } = preparar();
    tx.jornada.findMany.mockResolvedValue([crearJornada('CERRADA')]);
    tx.jornada.findUniqueOrThrow.mockResolvedValue(crearJornada('CERRADA'));
    await expect(
      service.registrarHorario({
        ...solicitud,
        tramos: [
          {
            entrada: entrada.toISOString(),
            salida: new Date(salida.getTime() + 3600000).toISOString(),
          },
        ],
      }),
    ).rejects.toThrow(/Editar horario/);
  });
  it('exige completar una jornada de otra fecha primero', async () => {
    const { tx, service } = preparar();
    tx.jornada.findMany.mockResolvedValue([
      { ...crearJornada(), fecha_jornada: new Date('2026-10-06T00:00:00Z') },
    ]);
    await expect(service.registrarHorario(solicitud)).rejects.toThrow(
      /pendiente/,
    );
    expect(tx.jornada.create).not.toHaveBeenCalled();
  });
  it('no acepta un id de otro empleado o fecha', async () => {
    const { service } = preparar();
    await expect(
      service.registrarHorario({ ...solicitud, idJornada: 999 }),
    ).rejects.toThrow(/no corresponde/);
  });
  it('con varias jornadas heredadas requiere seleccionar una', async () => {
    const { tx, service } = preparar();
    tx.jornada.findMany.mockResolvedValue([
      crearJornada('CERRADA'),
      { ...crearJornada('CERRADA'), id_jornada: 11 },
    ]);
    await expect(service.registrarHorario(solicitud)).rejects.toThrow(
      /varias jornadas/,
    );
  });
  it('rechaza empleados inactivos o inexistentes', async () => {
    const { tx, prisma, service } = preparar();
    tx.$queryRaw.mockResolvedValue([{ estado_empleado: 'INACTIVO' }]);
    await expect(service.registrarHorario(solicitud)).rejects.toThrow(
      ConflictException,
    );
    prisma.empleado.findUnique.mockResolvedValue(null);
    await expect(service.registrarHorario(solicitud)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('conserva la separación por área antes de escribir', async () => {
    const { prisma, service } = preparar();
    await accessContext.run(
      { area: 'PANADERIA', user: {} as AuthTokenPayload },
      async () => {
        await expect(service.registrarHorario(solicitud)).rejects.toThrow(
          ForbiddenException,
        );
      },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('Consulta de asistencia por fecha', () => {
  const findMany = jest
    .fn<
      Promise<unknown[]>,
      [
        {
          where: {
            [key: string]: unknown;
            OR: { fecha_entrega_dc: unknown }[];
          };
        },
      ]
    >()
    .mockResolvedValue([]);
  const service = new JornadasService(
    { jornada: { findMany } } as unknown as PrismaService,
    {} as NominaConfigService,
  );
  beforeEach(() => jest.clearAllMocks());
  it('consulta solo la fecha seleccionada y conserva el área', async () => {
    await service.findAll(undefined, undefined, '2026-10-07');
    expect(findMany.mock.calls[0][0].where).toEqual({
      empleado: { area: 'RESTAURANTE' },
      fecha_jornada: fecha,
    });
  });
  it('mantiene la consulta de abiertas sin descargar todo el historial', async () => {
    await service.findAll(undefined, 'ABIERTA');
    expect(findMany.mock.calls[0][0].where).toEqual({
      empleado: { area: 'RESTAURANTE' },
      estado_jornada: 'ABIERTA',
    });
  });
  it.each(['', 'invalid', '2026-02-30'])(
    'rechaza fecha inválida %s antes de consultar',
    async (fecha) => {
      await expect(
        service.findAll(undefined, undefined, fecha),
      ).rejects.toThrow(/fecha/);
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
