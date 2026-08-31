import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PropinasConfigService } from './propinas-config.service';

// Reparto de propinas del dia entre los empleados que trabajaron. La propina
// es el "servicio" cobrado a los clientes (monto_servicio_factura). Dos metodos:
//  - IGUALES: el pool total dividido en partes iguales entre los que trabajaron.
//  - PRESENCIA: cada propina se reparte entre los empleados que tenian jornada
//    abierta (marcados) en el instante en que se abrio ESE pedido; asi quien
//    trabajo solo de noche no recibe propina de mesas de la manana.
//
// El reparto crea un DevengoNomina "puro" por empleado (sin jornada ni concepto
// asociado): esa combinacion FK-nula es exclusiva de las propinas y sirve de
// firma para detectar/deshacer el reparto de un dia. Suma al saldo de nomina y
// se paga con el flujo normal de pagos.

export type MetodoReparto = 'IGUALES' | 'PRESENCIA';

interface FacturaPropina {
  monto: number; // servicio de esa cuenta
  instante: number; // fecha_pedido en ms (momento de atender la mesa)
}

interface Presencia {
  idEmpleado: number;
  nombre: string;
  intervalos: [number, number][]; // [entrada, salida] en ms
}

function num(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

@Injectable()
export class PropinasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propinasConfigService: PropinasConfigService,
  ) {}

  // "YYYY-MM-DD" -> limites locales del dia (el servidor corre en la zona del
  // restaurante) y la fecha @db.Date (medianoche UTC) para jornadas/devengos.
  private parsearFecha(fechaStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      throw new BadRequestException('Fecha invalida (se espera YYYY-MM-DD)');
    }
    const [y, mo, d] = fechaStr.split('-').map(Number);
    const inicio = new Date(y, mo - 1, d, 0, 0, 0, 0);
    const fin = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
    if (isNaN(inicio.getTime())) throw new BadRequestException('Fecha invalida');
    const fechaDb = new Date(Date.UTC(y, mo - 1, d));
    return { inicio, fin, fechaDb };
  }

  // Las propinas de un dia solo se reparten cuando el dia ya termino: el dia
  // acaba en su medianoche local (`fin`), asi que basta con que "ahora" ya la
  // haya pasado. Evita repartir a mitad de dia y perder las cuentas que faltaban
  // (un dia = un solo reparto). El servidor corre en la zona del restaurante, asi
  // que este calculo es la fuente de verdad (no depende del reloj del cliente).
  private diaFinalizado(fin: Date): boolean {
    return Date.now() >= fin.getTime();
  }

  private async facturasDelDia(inicio: Date, fin: Date): Promise<FacturaPropina[]> {
    const facturas = await this.prisma.factura.findMany({
      where: {
        estado_factura: 'PAGADA',
        subcuenta: { pedido: { fecha_pedido: { gte: inicio, lt: fin } } },
      },
      select: {
        monto_servicio_factura: true,
        subcuenta: { select: { pedido: { select: { fecha_pedido: true } } } },
        // Excedentes que el cliente destino a los meseros ("quedese con el
        // vuelto" -> propina): suman al pool de esa cuenta, en su mismo instante.
        pagos: {
          where: { destino_excedente_pago: 'PROPINA' },
          select: { monto_excedente_pago: true },
        },
      },
    });
    return facturas
      .map((f) => ({
        monto: num(f.monto_servicio_factura) + f.pagos.reduce((acc, p) => acc + num(p.monto_excedente_pago), 0),
        instante: f.subcuenta.pedido.fecha_pedido.getTime(),
      }))
      .filter((f) => f.monto > 0);
  }

  // Empleados con jornada ese dia y sus intervalos de presencia (marcaciones
  // ENTRADA/SALIDA emparejadas). Una jornada abierta (entrada sin salida) se
  // considera presente hasta el fin del dia.
  private async presenciasDelDia(fechaDb: Date, finMs: number): Promise<Presencia[]> {
    const jornadas = await this.prisma.jornada.findMany({
      where: { fecha_jornada: fechaDb },
      include: {
        marcaciones: { orderBy: { fecha_hora_marcacion: 'asc' } },
        empleado: { select: { id_empleado: true, nombre_empleado: true, apellido_empleado: true } },
      },
    });

    const porEmpleado = new Map<number, Presencia>();
    for (const j of jornadas) {
      const nombre = `${j.empleado.nombre_empleado} ${j.empleado.apellido_empleado}`.trim();
      const p = porEmpleado.get(j.empleado.id_empleado) ?? {
        idEmpleado: j.empleado.id_empleado,
        nombre,
        intervalos: [],
      };
      let entrada: number | null = null;
      for (const m of j.marcaciones) {
        const t = m.fecha_hora_marcacion.getTime();
        if (m.tipo_marcacion === 'ENTRADA') {
          entrada = t;
        } else if (entrada !== null) {
          p.intervalos.push([entrada, t]);
          entrada = null;
        }
      }
      if (entrada !== null) p.intervalos.push([entrada, finMs]); // jornada abierta
      porEmpleado.set(j.empleado.id_empleado, p);
    }
    return [...porEmpleado.values()];
  }

  private presenteEn(pres: Presencia, instante: number): boolean {
    return pres.intervalos.some(([a, b]) => instante >= a && instante <= b);
  }

  // Devengos "puros" (propinas) ya creados para ese dia, con su estado de pago.
  private async devengosPropinaDelDia(fechaDb: Date) {
    return this.prisma.devengoNomina.findMany({
      where: {
        fecha_devengoNomina: fechaDb,
        id_jornada_devengoNomina: null,
        id_conceptoNominaEmpleado_devengoNomina: null,
      },
      include: {
        pagoNominaDetalles: true,
        empleado: { select: { id_empleado: true, nombre_empleado: true, apellido_empleado: true } },
      },
    });
  }

  // Calcula el reparto (sin persistir) segun el metodo. `excluidos` solo aplica
  // a IGUALES (deseleccionar a alguien de la lista de los que trabajaron).
  // `pctCasa` es el porcentaje que retiene el restaurante (0 = no retiene): cada
  // propina se escala por (1 - pctCasa/100) antes de repartirse. La parte
  // retenida no se reparte (no genera devengo); solo se informa para la preview.
  private calcular(
    metodo: MetodoReparto,
    facturas: FacturaPropina[],
    presencias: Presencia[],
    excluidos: number[],
    pctCasa: number,
  ) {
    const pool = facturas.reduce((acc, f) => acc + f.monto, 0);
    const factor = pctCasa > 0 ? 1 - pctCasa / 100 : 1;
    const repartible = pool * factor; // lo que queda para los empleados
    const retencionCasa = pool - repartible; // lo que se queda el local

    const asignado = new Map<number, number>();
    for (const p of presencias) asignado.set(p.idEmpleado, 0);

    if (metodo === 'PRESENCIA') {
      for (const f of facturas) {
        const presentes = presencias.filter((p) => this.presenteEn(p, f.instante));
        if (presentes.length === 0) continue; // queda sin asignar
        const parte = (f.monto * factor) / presentes.length;
        for (const p of presentes) asignado.set(p.idEmpleado, (asignado.get(p.idEmpleado) ?? 0) + parte);
      }
      // Piso al peso por empleado; lo que sobra del redondeo/lo no presente
      // cae en "sin asignar".
      const asignaciones = presencias.map((p) => ({
        idEmpleado: p.idEmpleado,
        nombre: p.nombre,
        monto: Math.floor(asignado.get(p.idEmpleado) ?? 0),
      }));
      const distribuido = asignaciones.reduce((a, x) => a + x.monto, 0);
      return { pool, retencionCasa, repartible, asignaciones, sinAsignar: repartible - distribuido };
    }

    // IGUALES
    const elegibles = presencias.filter((p) => !excluidos.includes(p.idEmpleado));
    const n = elegibles.length;
    if (n === 0) {
      return { pool, retencionCasa, repartible, asignaciones: [], sinAsignar: repartible };
    }
    const repartiblePesos = Math.floor(repartible);
    const base = Math.floor(repartiblePesos / n);
    const resto = repartiblePesos - base * n; // pesos sueltos, 1 a cada uno de los primeros
    const asignaciones = elegibles.map((p, i) => ({
      idEmpleado: p.idEmpleado,
      nombre: p.nombre,
      monto: base + (i < resto ? 1 : 0),
    }));
    const distribuido = asignaciones.reduce((a, x) => a + x.monto, 0);
    return { pool, retencionCasa, repartible, asignaciones, sinAsignar: repartible - distribuido };
  }

  // Porcentaje que retiene el local: el override que manda el cliente (para
  // previsualizar/repartir en vivo lo que ve el ADMIN) o, si no lo manda, la
  // config guardada. Acotado a [0, 100]. Asi lo que se ve en pantalla es
  // exactamente lo que se repartira.
  private async pctCasaEfectivo(override: number | undefined, tx?: Prisma.TransactionClient) {
    if (override !== undefined && !Number.isNaN(override)) {
      return Math.max(0, Math.min(100, override));
    }
    const config = await this.propinasConfigService.findActiva(tx);
    return config.retiene_casa ? num(config.porcentaje_casa) : 0;
  }

  async preview(fechaStr: string, metodo: MetodoReparto, excluidos: number[] = [], pctCasaOverride?: number) {
    const { inicio, fin, fechaDb } = this.parsearFecha(fechaStr);
    const [facturas, presencias, yaRepartido, pctCasa] = await Promise.all([
      this.facturasDelDia(inicio, fin),
      this.presenciasDelDia(fechaDb, fin.getTime()),
      this.devengosPropinaDelDia(fechaDb),
      this.pctCasaEfectivo(pctCasaOverride),
    ]);

    const { pool, retencionCasa, repartible, asignaciones, sinAsignar } = this.calcular(
      metodo,
      facturas,
      presencias,
      excluidos,
      pctCasa,
    );

    return {
      fecha: fechaStr,
      metodo,
      pool: Math.round(pool),
      // Retencion del restaurante: cuanto se queda el local y cuanto se reparte.
      porcentajeCasa: pctCasa,
      retencionCasa: Math.round(retencionCasa),
      repartible: Math.round(repartible),
      cuentasConPropina: facturas.length,
      trabajaron: presencias.length,
      // El reparto solo se habilita cuando el dia ya termino (no a mitad de dia).
      diaFinalizado: this.diaFinalizado(fin),
      asignaciones,
      sinAsignar: Math.max(0, Math.round(sinAsignar)),
      // Si ya se repartio este dia, se informa para bloquear/ofrecer deshacer.
      repartoExistente:
        yaRepartido.length === 0
          ? null
          : {
              total: yaRepartido.reduce((a, d) => a + num(d.monto_devengoNomina), 0),
              empleados: yaRepartido.length,
              pagado: yaRepartido.some((d) => d.pagoNominaDetalles.length > 0),
              detalle: yaRepartido.map((d) => ({
                idEmpleado: d.id_empleado_devengoNomina,
                nombre: `${d.empleado.nombre_empleado} ${d.empleado.apellido_empleado}`.trim(),
                monto: num(d.monto_devengoNomina),
              })),
            },
    };
  }

  async repartir(fechaStr: string, metodo: MetodoReparto, excluidos: number[] = [], pctCasaOverride?: number) {
    const { inicio, fin, fechaDb } = this.parsearFecha(fechaStr);

    // Solo se reparten propinas de dias ya terminados: repartir a mitad de dia
    // dejaria por fuera las cuentas del resto del dia (el reparto es unico por dia).
    if (!this.diaFinalizado(fin)) {
      throw new ConflictException(
        'Las propinas solo se pueden repartir cuando el dia haya terminado; este dia aun no finaliza',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Idempotencia: un solo reparto por dia.
      const existentes = await tx.devengoNomina.count({
        where: {
          fecha_devengoNomina: fechaDb,
          id_jornada_devengoNomina: null,
          id_conceptoNominaEmpleado_devengoNomina: null,
        },
      });
      if (existentes > 0) {
        throw new ConflictException('Las propinas de este dia ya se repartieron; deshaz el reparto para rehacerlo');
      }

      const facturas = await this.facturasDelDia(inicio, fin);
      const presencias = await this.presenciasDelDia(fechaDb, fin.getTime());
      const pctCasa = await this.pctCasaEfectivo(pctCasaOverride, tx);
      const { asignaciones } = this.calcular(metodo, facturas, presencias, excluidos, pctCasa);

      const conMonto = asignaciones.filter((a) => a.monto > 0);
      if (conMonto.length === 0) {
        throw new ConflictException('No hay propinas para repartir ese dia (o nadie con jornada a quien asignarlas)');
      }

      await tx.devengoNomina.createMany({
        data: conMonto.map((a) => ({
          id_empleado_devengoNomina: a.idEmpleado,
          monto_devengoNomina: new Prisma.Decimal(a.monto),
          fecha_devengoNomina: fechaDb,
        })),
      });

      const total = conMonto.reduce((acc, a) => acc + a.monto, 0);
      return { fecha: fechaStr, metodo, empleados: conMonto.length, total };
    });
  }

  async deshacer(fechaStr: string) {
    const { fechaDb } = this.parsearFecha(fechaStr);
    return this.prisma.$transaction(async (tx) => {
      const devengos = await tx.devengoNomina.findMany({
        where: {
          fecha_devengoNomina: fechaDb,
          id_jornada_devengoNomina: null,
          id_conceptoNominaEmpleado_devengoNomina: null,
        },
        include: { pagoNominaDetalles: true },
      });
      if (devengos.length === 0) {
        throw new ConflictException('No hay un reparto de propinas registrado para ese dia');
      }
      if (devengos.some((d) => d.pagoNominaDetalles.length > 0)) {
        throw new ConflictException(
          'Algun empleado ya cobro parte de estas propinas; no se puede deshacer el reparto',
        );
      }
      await tx.devengoNomina.deleteMany({
        where: { id_devengoNomina: { in: devengos.map((d) => d.id_devengoNomina) } },
      });
      return { fecha: fechaStr, eliminados: devengos.length };
    });
  }
}
