import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

// Reportes/analitica para el ADMIN. Fuente de verdad del dinero: facturas
// PAGADA (excluye EMITIDA a medias y ANULADA) filtradas por fecha_emision, para
// reconciliar con la vista de "cuentas pagadas" de caja.
//
// NOTA: este endpoint devuelve los montos como number (no como el string de
// Prisma.Decimal del resto de la API) porque alimentan graficas; son valores de
// visualizacion redondeados a 2 decimales, no cifras transaccionales.

type Rango = { gte: Date; lte: Date };

const FACTURA_SELECT = {
  fecha_emision_factura: true,
  monto_total_factura: true,
  subcuenta: {
    select: {
      pedido: {
        select: {
          id_pedido: true,
          tipo_pedido: true,
          mesero: {
            select: {
              id_usuario: true,
              empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
            },
          },
          ficha: { select: { id_ficha: true, numero_ficha: true } },
        },
      },
    },
  },
} satisfies Prisma.FacturaSelect;

const DETALLE_SELECT = {
  cantidad_producto_dc: true,
  precio_unitario_dc: true,
  producto: {
    select: {
      id_producto: true,
      nombre_producto: true,
      categoria: { select: { id_categoria: true, nombre_categoria: true } },
    },
  },
  combo: { select: { id_combo: true, nombre_combo: true } },
} satisfies Prisma.DetalleComandaSelect;

type FacturaFila = Prisma.FacturaGetPayload<{ select: typeof FACTURA_SELECT }>;
const DETALLE_FACTURADO_SELECT = {
  proporcion_facturada_fd: true,
  subtotal_facturado_fd: true,
  detalleComanda: { select: DETALLE_SELECT },
} satisfies Prisma.FacturaDetalleSelect;
type DetalleFacturadoFila = Prisma.FacturaDetalleGetPayload<{ select: typeof DETALLE_FACTURADO_SELECT }>;

// Prisma.Decimal | null -> number a 2 decimales.
function num(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d.toFixed(2)) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Dia local "YYYY-MM-DD" (el servidor corre en la zona del restaurante).
function claveDiaLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// % de cambio vs periodo anterior. null cuando no hay base de comparacion
// (evita "infinito" cuando el periodo previo fue 0).
function deltaPct(actual: number, previo: number): number | null {
  if (previo === 0) return null;
  return round2(((actual - previo) / previo) * 100);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen(desdeStr?: string, hastaStr?: string, area = 'RESTAURANTE') {
    const ahora = new Date();
    const hasta = hastaStr ? new Date(hastaStr) : ahora;
    const desde = desdeStr ? new Date(desdeStr) : new Date(ahora.getTime() - 30 * 24 * 3600 * 1000);
    if (isNaN(desde.getTime())) throw new BadRequestException('Fecha "desde" invalida');
    if (isNaN(hasta.getTime())) throw new BadRequestException('Fecha "hasta" invalida');
    if (desde.getTime() > hasta.getTime()) {
      throw new BadRequestException('El rango de fechas es invalido (desde posterior a hasta)');
    }
    if (area !== 'RESTAURANTE' && area !== 'PANADERIA')
      throw new BadRequestException('Area de negocio no valida');
    if (area === 'PANADERIA') return this.resumenPanaderia(desde, hasta);

    const rango: Rango = { gte: desde, lte: hasta };
    // Periodo anterior de igual duracion, para los deltas de los KPIs.
    const duracion = hasta.getTime() - desde.getTime();
    const rangoPrevio: Rango = { gte: new Date(desde.getTime() - duracion), lte: desde };

    const [kpis, kpisPrevio, facturas, metodos, detalles, ocupacion] = await Promise.all([
      this.calcularKpis(rango),
      this.calcularKpis(rangoPrevio),
      this.facturasDelRango(rango),
      this.metodosPago(rango),
      this.detallesVendidos(rango),
      this.ocupacionFichas(),
    ]);

    return {
      rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      ventas: {
        netas: kpis.netas,
        propina: kpis.propina,
        cuentas: kpis.cuentas,
        items: kpis.items,
        domicilios: kpis.domicilios,
        ticketPromedio: kpis.cuentas > 0 ? round2(kpis.netas / kpis.cuentas) : 0,
        delta: {
          netas: deltaPct(kpis.netas, kpisPrevio.netas),
          propina: deltaPct(kpis.propina, kpisPrevio.propina),
          cuentas: deltaPct(kpis.cuentas, kpisPrevio.cuentas),
          items: deltaPct(kpis.items, kpisPrevio.items),
          domicilios: deltaPct(kpis.domicilios, kpisPrevio.domicilios),
          ticketPromedio: deltaPct(
            kpis.cuentas > 0 ? kpis.netas / kpis.cuentas : 0,
            kpisPrevio.cuentas > 0 ? kpisPrevio.netas / kpisPrevio.cuentas : 0,
          ),
        },
      },
      porDia: this.agruparPorDia(facturas, desde, hasta),
      porHora: this.agruparPorHora(facturas),
      metodosPago: metodos,
      topProductos: this.agruparTopProductos(detalles),
      porCategoria: this.agruparPorCategoria(detalles),
      porMesero: this.agruparPorMesero(facturas),
      porFicha: this.agruparPorFicha(facturas),
      ocupacionFichas: ocupacion,
    };
  }

  // ---- KPIs (agregados rapidos, sin traer filas) ----

  private async calcularKpis(rango: Rango) {
    const facturaFiltro = { estado_factura: 'PAGADA' as const, fecha_emision_factura: rango };
    const [agg, aggItems, domicilios] = await Promise.all([
      this.prisma.factura.aggregate({
        where: facturaFiltro,
        _sum: { monto_total_factura: true, monto_servicio_factura: true },
        _count: { _all: true },
      }),
      this.detallesVendidos(rango, true),
      // Domicilios: pedidos DOMICILIO distintos con al menos una factura pagada
      // en el rango (no cuenta por factura, para no inflar si se dividio la cuenta).
      this.prisma.pedido.count({
        where: { tipo_pedido: 'DOMICILIO', subcuentas: { some: { facturas: { some: facturaFiltro } } } },
      }),
    ]);
    return {
      netas: num(agg._sum.monto_total_factura),
      propina: num(agg._sum.monto_servicio_factura),
      cuentas: agg._count._all,
      items: aggItems.reduce(
        (total, detalle) => total + detalle.detalleComanda.cantidad_producto_dc * num(detalle.proporcion_facturada_fd),
        0,
      ),
      domicilios,
    };
  }

  // ---- filas base para agrupar en JS ----

  private facturasDelRango(rango: Rango): Promise<FacturaFila[]> {
    return this.prisma.factura.findMany({
      where: { estado_factura: 'PAGADA', fecha_emision_factura: rango },
      select: FACTURA_SELECT,
    });
  }

  private async metodosPago(rango: Rango) {
    const grupos = await this.prisma.pago.groupBy({
      by: ['metodo_pago'],
      where: { factura: { estado_factura: 'PAGADA', fecha_emision_factura: rango } },
      _sum: { monto_total_pago: true },
      _count: { _all: true },
    });
    return grupos
      .map((g) => ({ metodo: g.metodo_pago, monto: num(g._sum.monto_total_pago), cuenta: g._count._all }))
      .sort((a, b) => b.monto - a.monto);
  }

  // Se consulta FacturaDetalle, no toda la subcuenta: una factura solo reporta
  // sus productos/proporciones exactos, incluso si luego se agregaron rondas.
  private detallesVendidos(rango: Rango, soloPadres = false): Promise<DetalleFacturadoFila[]> {
    return this.prisma.facturaDetalle.findMany({
      where: {
        factura: { estado_factura: 'PAGADA', fecha_emision_factura: rango },
        detalleComanda: {
          estado_dc: { not: 'CANCELADO' },
          ...(soloPadres && { id_detalleComandaPadre_dc: null }),
        },
      },
      select: DETALLE_FACTURADO_SELECT,
    });
  }

  private async resumenPanaderia(desde: Date, hasta: Date) {
    const duracion = hasta.getTime() - desde.getTime();
    const inicioPrevio = new Date(desde.getTime() - duracion);
    const [ventas, previas] = await Promise.all([
      this.prisma.ventaPanaderia.findMany({
        where: { fecha: { gte: desde, lte: hasta }, turno: { caja: { area: 'PANADERIA' } } },
        include: { detalles: { include: { articulo: { select: { tipo: true } } } }, pagos: true },
      }),
      this.prisma.ventaPanaderia.findMany({
        where: { fecha: { gte: inicioPrevio, lt: desde }, turno: { caja: { area: 'PANADERIA' } } },
        select: { total: true, detalles: { select: { cantidad: true } } },
      }),
    ]);
    const netas = round2(ventas.reduce((s, v) => s + num(v.total), 0));
    const netasPrevias = round2(previas.reduce((s, v) => s + num(v.total), 0));
    const items = ventas.reduce((s, v) => s + v.detalles.reduce((n, d) => n + Number(d.cantidad), 0), 0);
    const itemsPrevios = previas.reduce((s, v) => s + v.detalles.reduce((n, d) => n + Number(d.cantidad), 0), 0);
    const porDia = new Map<string, { fecha: string; total: number; cuentas: number; domicilios: number }>();
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    for (let dias = 0; cursor <= fin && dias < 400; dias++, cursor.setDate(cursor.getDate() + 1)) {
      const fecha = claveDiaLocal(cursor);
      porDia.set(fecha, { fecha, total: 0, cuentas: 0, domicilios: 0 });
    }
    const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0, cuentas: 0 }));
    const metodos = new Map<string, { metodo: string; monto: number; cuenta: number }>();
    const articulos = new Map<number, { nombre: string; unidades: number; ingresos: number }>();
    const categorias = new Map<string, { categoria: string; unidades: number; ingresos: number }>();
    const nombresCategoria = { PANADERIA: 'Panaderia', EXTERNO: 'Bebidas y externos', INSUMO: 'Insumos' };
    for (const venta of ventas) {
      const dia = porDia.get(claveDiaLocal(venta.fecha));
      if (dia) { dia.total += num(venta.total); dia.cuentas += 1; }
      const hora = porHora[venta.fecha.getHours()];
      hora.total += num(venta.total); hora.cuentas += 1;
      for (const pago of venta.pagos) {
        const actual = metodos.get(pago.metodo) ?? { metodo: pago.metodo, monto: 0, cuenta: 0 };
        actual.monto += num(pago.monto); actual.cuenta += 1;
        metodos.set(pago.metodo, actual);
      }
      for (const detalle of venta.detalles) {
        const unidades = Number(detalle.cantidad);
        const ingresos = num(detalle.subtotal);
        const articulo = articulos.get(detalle.articuloId) ?? { nombre: detalle.nombreSnapshot, unidades: 0, ingresos: 0 };
        articulo.unidades += unidades; articulo.ingresos += ingresos;
        articulos.set(detalle.articuloId, articulo);
        const nombreCategoria = nombresCategoria[detalle.articulo.tipo];
        const categoria = categorias.get(nombreCategoria) ?? { categoria: nombreCategoria, unidades: 0, ingresos: 0 };
        categoria.unidades += unidades; categoria.ingresos += ingresos;
        categorias.set(nombreCategoria, categoria);
      }
    }
    const promedio = ventas.length ? round2(netas / ventas.length) : 0;
    const promedioPrevio = previas.length ? round2(netasPrevias / previas.length) : 0;
    return {
      rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      ventas: {
        netas, propina: 0, cuentas: ventas.length, items, domicilios: 0, ticketPromedio: promedio,
        delta: {
          netas: deltaPct(netas, netasPrevias), propina: null,
          cuentas: deltaPct(ventas.length, previas.length), items: deltaPct(items, itemsPrevios),
          domicilios: null, ticketPromedio: deltaPct(promedio, promedioPrevio),
        },
      },
      porDia: [...porDia.values()].map((d) => ({ ...d, total: round2(d.total) })),
      porHora: porHora.map((h) => ({ ...h, total: round2(h.total) })),
      metodosPago: [...metodos.values()].map((m) => ({ ...m, monto: round2(m.monto) })).sort((a, b) => b.monto - a.monto),
      topProductos: [...articulos.values()].map((a) => ({ ...a, ingresos: round2(a.ingresos) })).sort((a, b) => b.ingresos - a.ingresos).slice(0, 10),
      porCategoria: [...categorias.values()].map((c) => ({ ...c, ingresos: round2(c.ingresos) })).sort((a, b) => b.ingresos - a.ingresos),
      porMesero: [], porFicha: [], ocupacionFichas: { DISPONIBLES: 0, OCUPADAS: 0, DESACTIVADAS: 0 },
    };
  }

  private async ocupacionFichas() {
    const [grupos, ocupadas] = await Promise.all([
      this.prisma.ficha.groupBy({ by: ['ficha_activa'], _count: { _all: true } }),
      this.prisma.pedido.count({
        where: { id_ficha_pedido: { not: null }, estado_pedido: { notIn: ['CERRADO', 'CANCELADO'] } },
      }),
    ]);
    const activas = grupos.find((grupo) => grupo.ficha_activa)?._count._all ?? 0;
    const desactivadas = grupos.find((grupo) => !grupo.ficha_activa)?._count._all ?? 0;
    return { DISPONIBLES: Math.max(0, activas - ocupadas), OCUPADAS: ocupadas, DESACTIVADAS: desactivadas };
  }

  // ---- agrupaciones en memoria ----

  private agruparPorDia(facturas: FacturaFila[], desde: Date, hasta: Date) {
    // domicilios se cuenta por pedido DOMICILIO distinto del dia (Set), no por
    // factura, para no inflar cuando una cuenta se dividio en varias facturas.
    const acum = new Map<string, { total: number; cuentas: number; domicilios: Set<number> }>();
    for (const f of facturas) {
      const clave = claveDiaLocal(f.fecha_emision_factura);
      const e = acum.get(clave) ?? { total: 0, cuentas: 0, domicilios: new Set<number>() };
      e.total += num(f.monto_total_factura);
      e.cuentas += 1;
      if (f.subcuenta.pedido.tipo_pedido === 'DOMICILIO') {
        e.domicilios.add(f.subcuenta.pedido.id_pedido);
      }
      acum.set(clave, e);
    }
    // Rellena los dias sin ventas con 0 para que la serie no tenga huecos.
    const serie: { fecha: string; total: number; cuentas: number; domicilios: number }[] = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    let guardas = 0; // tope defensivo (~370 dias)
    while (cursor.getTime() <= fin.getTime() && guardas < 400) {
      const clave = claveDiaLocal(cursor);
      const e = acum.get(clave) ?? { total: 0, cuentas: 0, domicilios: new Set<number>() };
      serie.push({ fecha: clave, total: round2(e.total), cuentas: e.cuentas, domicilios: e.domicilios.size });
      cursor.setDate(cursor.getDate() + 1);
      guardas += 1;
    }
    return serie;
  }

  private agruparPorHora(facturas: FacturaFila[]) {
    const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0, cuentas: 0 }));
    for (const f of facturas) {
      const h = f.fecha_emision_factura.getHours();
      horas[h].total += num(f.monto_total_factura);
      horas[h].cuentas += 1;
    }
    return horas.map((x) => ({ ...x, total: round2(x.total) }));
  }

  private agruparTopProductos(detalles: DetalleFacturadoFila[]) {
    const acum = new Map<string, { nombre: string; unidades: number; ingresos: number }>();
    for (const facturado of detalles) {
      const d = facturado.detalleComanda;
      const clave = d.producto ? `p${d.producto.id_producto}` : d.combo ? `c${d.combo.id_combo}` : null;
      if (!clave) continue;
      const nombre = d.producto?.nombre_producto ?? d.combo?.nombre_combo ?? 'Item';
      const e = acum.get(clave) ?? { nombre, unidades: 0, ingresos: 0 };
      e.unidades += d.cantidad_producto_dc * num(facturado.proporcion_facturada_fd);
      e.ingresos += num(facturado.subtotal_facturado_fd);
      acum.set(clave, e);
    }
    return [...acum.values()]
      .map((e) => ({ ...e, ingresos: round2(e.ingresos) }))
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, 10);
  }

  private agruparPorCategoria(detalles: DetalleFacturadoFila[]) {
    const acum = new Map<string, { categoria: string; unidades: number; ingresos: number }>();
    for (const facturado of detalles) {
      const d = facturado.detalleComanda;
      const cat = d.producto?.categoria?.nombre_categoria ?? (d.combo ? 'Combos' : 'Sin categoria');
      const clave = d.producto?.categoria
        ? `cat${d.producto.categoria.id_categoria}`
        : d.combo
          ? 'combos'
          : 'sin';
      const e = acum.get(clave) ?? { categoria: cat, unidades: 0, ingresos: 0 };
      e.unidades += d.cantidad_producto_dc * num(facturado.proporcion_facturada_fd);
      e.ingresos += num(facturado.subtotal_facturado_fd);
      acum.set(clave, e);
    }
    return [...acum.values()]
      .map((e) => ({ ...e, ingresos: round2(e.ingresos) }))
      .sort((a, b) => b.ingresos - a.ingresos);
  }

  private agruparPorMesero(facturas: FacturaFila[]) {
    const acum = new Map<number, { mesero: string; ventas: number; pedidos: Set<number> }>();
    for (const f of facturas) {
      const m = f.subcuenta.pedido.mesero;
      const nombre = `${m.empleado.nombre_empleado} ${m.empleado.apellido_empleado}`.trim();
      const e = acum.get(m.id_usuario) ?? { mesero: nombre, ventas: 0, pedidos: new Set<number>() };
      e.ventas += num(f.monto_total_factura);
      e.pedidos.add(f.subcuenta.pedido.id_pedido);
      acum.set(m.id_usuario, e);
    }
    return [...acum.values()]
      .map((e) => ({
        mesero: e.mesero,
        ventas: round2(e.ventas),
        pedidos: e.pedidos.size,
        ticketPromedio: e.pedidos.size > 0 ? round2(e.ventas / e.pedidos.size) : 0,
      }))
      .sort((a, b) => b.ventas - a.ventas);
  }

  private agruparPorFicha(facturas: FacturaFila[]) {
    const acum = new Map<number | string, { ficha: string; ventas: number; cuentas: number }>();
    for (const f of facturas) {
      const ficha = f.subcuenta.pedido.ficha;
      const clave = ficha?.id_ficha ?? 'domicilio-sin-ficha';
      const nombre = ficha ? `Ficha ${ficha.numero_ficha}` : 'Domicilio / sin ficha';
      const e = acum.get(clave) ?? { ficha: nombre, ventas: 0, cuentas: 0 };
      e.ventas += num(f.monto_total_factura);
      e.cuentas += 1;
      acum.set(clave, e);
    }
    return [...acum.values()]
      .map((e) => ({ ...e, ventas: round2(e.ventas) }))
      .sort((a, b) => b.ventas - a.ventas);
  }
}
