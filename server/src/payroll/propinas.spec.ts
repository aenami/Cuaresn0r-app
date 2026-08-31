import { BadRequestException, ConflictException } from '@nestjs/common';
import { PropinasService, MetodoReparto } from './propinas.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropinasConfigService } from './propinas-config.service';
import { Prisma } from '../generated/prisma/client';

// Vistas tipadas de la logica interna (pura) del servicio: `calcular`,
// `presenteEn`, `diaFinalizado` y `parsearFecha` no tocan la base de datos, asi
// que se prueban instanciando el servicio con dependencias vacias.
interface FacturaPropina {
  monto: number;
  instante: number;
}
interface Presencia {
  idEmpleado: number;
  nombre: string;
  intervalos: [number, number][];
}
interface CalcularResult {
  pool: number;
  retencionCasa: number;
  repartible: number;
  asignaciones: { idEmpleado: number; nombre: string; monto: number }[];
  sinAsignar: number;
}
type Internals = {
  calcular(m: MetodoReparto, f: FacturaPropina[], p: Presencia[], excluidos: number[], pctCasa: number): CalcularResult;
  presenteEn(p: Presencia, instante: number): boolean;
  diaFinalizado(fin: Date): boolean;
  parsearFecha(s: string): { inicio: Date; fin: Date; fechaDb: Date };
};

function servicioPuro() {
  return new PropinasService({} as PrismaService, {} as PropinasConfigService);
}
function internos() {
  return servicioPuro() as unknown as Internals;
}

// Dia local de hoy en formato YYYY-MM-DD (mismo criterio que la UI).
function hoyYmd() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

const presenciasTres: Presencia[] = [
  { idEmpleado: 1, nombre: 'A', intervalos: [[0, 1000]] },
  { idEmpleado: 2, nombre: 'B', intervalos: [[0, 1000]] },
  { idEmpleado: 3, nombre: 'C', intervalos: [[0, 1000]] },
];

describe('PropinasService.calcular (IGUALES)', () => {
  it('reparte el pool en partes iguales y da el peso suelto a los primeros', () => {
    const r = internos().calcular('IGUALES', [{ monto: 100, instante: 10 }], presenciasTres, [], 0);
    expect(r.pool).toBe(100);
    expect(r.asignaciones.map((a) => a.monto)).toEqual([34, 33, 33]); // 100/3 -> 34,33,33
    expect(r.sinAsignar).toBe(0);
  });

  it('excluye a los deseleccionados y reparte solo entre el resto', () => {
    const r = internos().calcular('IGUALES', [{ monto: 100, instante: 10 }], presenciasTres, [2], 0);
    expect(r.asignaciones.map((a) => a.idEmpleado)).toEqual([1, 3]);
    expect(r.asignaciones.map((a) => a.monto)).toEqual([50, 50]);
    expect(r.sinAsignar).toBe(0);
  });

  it('aplica la retencion del local antes de repartir', () => {
    const r = internos().calcular('IGUALES', [{ monto: 100, instante: 10 }], presenciasTres, [], 10);
    expect(r.retencionCasa).toBe(10);
    expect(r.repartible).toBe(90);
    expect(r.asignaciones.map((a) => a.monto)).toEqual([30, 30, 30]);
  });

  it('si no queda nadie elegible, todo lo repartible queda sin asignar', () => {
    const r = internos().calcular('IGUALES', [{ monto: 100, instante: 10 }], presenciasTres, [1, 2, 3], 0);
    expect(r.asignaciones).toEqual([]);
    expect(r.sinAsignar).toBe(100);
  });
});

describe('PropinasService.calcular (PRESENCIA)', () => {
  const presencias: Presencia[] = [
    { idEmpleado: 1, nombre: 'A', intervalos: [[0, 100]] },
    { idEmpleado: 2, nombre: 'B', intervalos: [[50, 200]] },
  ];

  it('asigna cada propina solo a quien estaba presente en ese instante', () => {
    const r = internos().calcular(
      'PRESENCIA',
      [
        { monto: 100, instante: 10 }, // solo A presente
        { monto: 100, instante: 150 }, // solo B presente
      ],
      presencias,
      [],
      0,
    );
    expect(r.pool).toBe(200);
    expect(r.asignaciones).toEqual([
      { idEmpleado: 1, nombre: 'A', monto: 100 },
      { idEmpleado: 2, nombre: 'B', monto: 100 },
    ]);
    expect(r.sinAsignar).toBe(0);
  });

  it('las propinas de momentos sin nadie marcado quedan sin asignar', () => {
    const r = internos().calcular('PRESENCIA', [{ monto: 100, instante: 500 }], presencias, [], 0);
    expect(r.asignaciones.every((a) => a.monto === 0)).toBe(true);
    expect(r.sinAsignar).toBe(100);
  });

  it('escala cada propina por la retencion del local', () => {
    const r = internos().calcular('PRESENCIA', [{ monto: 100, instante: 10 }], [presencias[0]], [], 20);
    expect(r.retencionCasa).toBe(20);
    expect(r.asignaciones).toEqual([{ idEmpleado: 1, nombre: 'A', monto: 80 }]);
    expect(r.sinAsignar).toBe(0);
  });
});

describe('PropinasService.presenteEn', () => {
  const p: Presencia = { idEmpleado: 1, nombre: 'A', intervalos: [[50, 200]] };
  it('incluye los bordes del intervalo', () => {
    expect(internos().presenteEn(p, 50)).toBe(true);
    expect(internos().presenteEn(p, 200)).toBe(true);
    expect(internos().presenteEn(p, 120)).toBe(true);
  });
  it('excluye fuera del intervalo', () => {
    expect(internos().presenteEn(p, 49)).toBe(false);
    expect(internos().presenteEn(p, 201)).toBe(false);
  });
});

describe('PropinasService.diaFinalizado', () => {
  it('es verdadero para un dia ya pasado', () => {
    expect(internos().diaFinalizado(new Date('2000-01-01T00:00:00.000Z'))).toBe(true);
  });
  it('es falso para un dia futuro', () => {
    expect(internos().diaFinalizado(new Date('2999-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('PropinasService.parsearFecha', () => {
  it('convierte YYYY-MM-DD al dia @db.Date (medianoche UTC)', () => {
    const { fechaDb } = internos().parsearFecha('2026-07-12');
    expect(fechaDb.toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });
  it('rechaza formatos invalidos', () => {
    expect(() => internos().parsearFecha('12/07/2026')).toThrow(BadRequestException);
    expect(() => internos().parsearFecha('no-es-fecha')).toThrow(BadRequestException);
  });
});

describe('PropinasService.repartir (regla: solo dias terminados)', () => {
  it('bloquea el reparto de HOY con 409 (el dia aun no termina)', async () => {
    // La guarda se evalua antes de tocar la base de datos, por eso el prisma vacio.
    await expect(servicioPuro().repartir(hoyYmd(), 'IGUALES', [], 0)).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloquea el reparto de un dia futuro', async () => {
    await expect(servicioPuro().repartir('2999-01-01', 'IGUALES', [], 0)).rejects.toThrow(/aun no finaliza/);
  });
});

describe('PropinasService.repartir (persistencia, con prisma simulado)', () => {
  const facturaMock = {
    monto_servicio_factura: new Prisma.Decimal(100),
    subcuenta: { pedido: { fecha_pedido: new Date('2000-01-01T12:00:00.000Z') } },
    pagos: [], // sin excedentes destinados a propina
  };
  const jornadaMock = (id: number, nombre: string) => ({
    empleado: { id_empleado: id, nombre_empleado: nombre, apellido_empleado: 'X' },
    marcaciones: [{ tipo_marcacion: 'ENTRADA', fecha_hora_marcacion: new Date('2000-01-01T09:00:00.000Z') }],
  });

  it('es idempotente: 409 si ese dia ya tiene reparto', async () => {
    const tx = { devengoNomina: { count: jest.fn().mockResolvedValue(1) } };
    const prisma = { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx) } as unknown as PrismaService;
    const svc = new PropinasService(prisma, {} as PropinasConfigService);
    await expect(svc.repartir('2000-01-01', 'IGUALES', [], 0)).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea un devengo "puro" por empleado con la retencion ya aplicada', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { devengoNomina: { count: jest.fn().mockResolvedValue(0), createMany } };
    const prisma = {
      $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
      factura: { findMany: jest.fn().mockResolvedValue([facturaMock]) },
      jornada: { findMany: jest.fn().mockResolvedValue([jornadaMock(1, 'A'), jornadaMock(2, 'B')]) },
    } as unknown as PrismaService;
    const svc = new PropinasService(prisma, {} as PropinasConfigService);

    // pool 100, retencion 10% -> repartible 90 entre 2 -> 45 c/u.
    const res = await svc.repartir('2000-01-01', 'IGUALES', [], 10);
    expect(res).toEqual({ fecha: '2000-01-01', metodo: 'IGUALES', empleados: 2, total: 90 });

    expect(createMany).toHaveBeenCalledTimes(1);
    const data = createMany.mock.calls[0][0].data as {
      id_empleado_devengoNomina: number;
      monto_devengoNomina: Prisma.Decimal;
      id_jornada_devengoNomina?: number;
      id_conceptoNominaEmpleado_devengoNomina?: number;
    }[];
    expect(data).toHaveLength(2);
    expect(data.map((x) => x.monto_devengoNomina.toString())).toEqual(['45', '45']);
    // Firma de propina: ambos FK nulos (ni jornada ni concepto).
    for (const fila of data) {
      expect(fila.id_jornada_devengoNomina).toBeUndefined();
      expect(fila.id_conceptoNominaEmpleado_devengoNomina).toBeUndefined();
    }
  });
});

describe('PropinasService.facturasDelDia (excedente a propina)', () => {
  it('suma al pool de cada cuenta el excedente que el cliente dejo para meseros', async () => {
    const prisma = {
      factura: {
        findMany: jest.fn().mockResolvedValue([
          {
            monto_servicio_factura: new Prisma.Decimal(100),
            subcuenta: { pedido: { fecha_pedido: new Date('2000-01-01T12:00:00.000Z') } },
            pagos: [{ monto_excedente_pago: new Prisma.Decimal(50) }], // excedente destinado a PROPINA
          },
        ]),
      },
    } as unknown as PrismaService;
    const svc = new PropinasService(prisma, {} as PropinasConfigService);
    const internos = svc as unknown as {
      facturasDelDia(inicio: Date, fin: Date): Promise<{ monto: number; instante: number }[]>;
    };

    const res = await internos.facturasDelDia(new Date('2000-01-01'), new Date('2000-01-02'));
    expect(res[0].monto).toBe(150); // 100 de servicio + 50 de excedente-propina
  });
});
