import { Injectable } from '@nestjs/common';
import { Prisma, DestinoImpresion } from '../generated/prisma/client';
import { EscPosBuilder, columnasPorAncho } from './escpos';

// Forma de la comanda que necesita el armado de tickets.
export const COMANDA_PARA_IMPRESION = {
  pedido: {
    include: {
      ficha: true,
      mesero: { select: { email_usuario: true } },
    },
  },
  detalles: {
    include: {
      producto: { include: { categoria: true } },
      combo: true,
      ingredientesPersonalizados: { include: { ingrediente: true } },
      hijos: {
        include: {
          producto: { include: { categoria: true } },
          ingredientesPersonalizados: { include: { ingrediente: true } },
        },
      },
    },
  },
} satisfies Prisma.ComandaInclude;

export type ComandaParaImpresion = Prisma.ComandaGetPayload<{ include: typeof COMANDA_PARA_IMPRESION }>;
type DetalleImpresion = ComandaParaImpresion['detalles'][number];
type HijoImpresion = DetalleImpresion['hijos'][number];

// Forma de la factura que necesita el ticket para el cliente (recibo de venta).
export const FACTURA_PARA_IMPRESION = {
  pagos: {
    orderBy: { fecha_pago: 'asc' },
    // El cajero sale del dueno del turno donde se registro el primer pago.
    include: {
      turno: {
        select: {
          usuario: {
            select: {
              email_usuario: true,
              empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
            },
          },
        },
      },
    },
  },
  subcuenta: {
    include: {
      pedido: {
        select: {
          id_pedido: true,
          tipo_pedido: true,
          nombre_cliente_pedido: true,
          telefono_cliente_pedido: true,
          direccion_cliente_pedido: true,
          ficha: { select: { numero_ficha: true } },
        },
      },
    },
  },
  detalles: {
    orderBy: { id_facturaDetalle: 'asc' },
    include: {
      detalleComanda: {
        include: {
          producto: { select: { nombre_producto: true } },
          combo: { select: { nombre_combo: true } },
        },
      },
    },
  },
} satisfies Prisma.FacturaInclude;

export type FacturaParaImpresion = Prisma.FacturaGetPayload<{ include: typeof FACTURA_PARA_IMPRESION }>;
type ItemFactura = FacturaParaImpresion['detalles'][number];

// Datos del negocio para el encabezado (subconjunto de ConfiguracionNegocio).
export interface DatosNegocioTicket {
  nombre_negocio: string;
  nit_negocio: string | null;
  direccion_negocio: string | null;
  telefono_negocio: string | null;
}

const ETIQUETA_METODO_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};

// El destino de un detalle lo dicta la categoria de SU producto.
export function destinoDeDetalle(detalle: { producto?: { categoria?: { destino_categoria: DestinoImpresion } | null } | null }): DestinoImpresion {
  return detalle.producto?.categoria?.destino_categoria ?? 'COCINA';
}

// Un ticket por destino solo tiene sentido si algun detalle apunta ahi.
export function destinosDeComanda(comanda: ComandaParaImpresion): DestinoImpresion[] {
  const destinos = new Set<DestinoImpresion>();
  for (const detalle of comanda.detalles) {
    if (detalle.estado_dc === 'CANCELADO') continue;
    if (detalle.id_detalleComandaPadre_dc !== null) continue; // los hijos se evaluan via su padre
    if (detalle.id_combo_dc !== null) {
      for (const hijo of detalle.hijos) {
        if (hijo.estado_dc !== 'CANCELADO') destinos.add(destinoDeDetalle(hijo));
      }
    } else {
      destinos.add(destinoDeDetalle(detalle));
      for (const hijo of detalle.hijos) {
        if (hijo.estado_dc !== 'CANCELADO') destinos.add(destinoDeDetalle(hijo));
      }
    }
  }
  return [...destinos];
}

@Injectable()
export class TicketBuilderService {
  armarTicketComanda(
    comanda: ComandaParaImpresion,
    destino: DestinoImpresion,
    anchoPapelMm: number,
    reimpresion = false,
  ): Buffer {
    const t = new EscPosBuilder(columnasPorAncho(anchoPapelMm));
    const pedido = comanda.pedido;

    t.centrar().tamanoDoble(true).negrita(true);
    t.texto(destino === 'BARRA' ? '* BARRA *' : '* COCINA *');
    if (pedido.ficha) {
      t.texto(`FICHA ${pedido.ficha.numero_ficha}`);
      t.tamanoDoble(false).negrita(false);
    } else if (pedido.tipo_pedido === 'LOCAL') {
      t.texto('SIN FICHA');
      t.tamanoDoble(false).negrita(false);
    } else {
      t.texto('DOMICILIO');
      t.tamanoDoble(false).negrita(false);
      if (pedido.nombre_cliente_pedido) t.texto(pedido.nombre_cliente_pedido);
    }
    if (reimpresion) t.negrita(true).texto('** REIMPRESION **').negrita(false);
    t.izquierda();
    t.texto(`Pedido #${pedido.id_pedido} · Comanda #${comanda.id_comanda}`);
    t.texto(this.formatearFecha(comanda.creacion_comanda));
    t.texto(`Mesero: ${pedido.mesero.email_usuario}`);
    t.separador();

    for (const detalle of comanda.detalles) {
      if (detalle.estado_dc === 'CANCELADO') continue;
      if (detalle.id_detalleComandaPadre_dc !== null) continue;

      if (detalle.id_combo_dc !== null) {
        this.bloqueCombo(t, detalle, destino);
      } else {
        this.bloqueProducto(t, detalle, destino);
      }
    }

    t.separador();
    t.avanzar(3).cortar();
    return t.build();
  }

  armarTicketPrueba(nombreImpresora: string, destino: DestinoImpresion, anchoPapelMm: number): Buffer {
    const t = new EscPosBuilder(columnasPorAncho(anchoPapelMm));
    t.centrar().tamanoDoble(true).negrita(true).texto('PRUEBA DE IMPRESION');
    t.tamanoDoble(false).negrita(false);
    t.texto(`${nombreImpresora} · ${destino}`);
    t.texto(this.formatearFecha(new Date()));
    t.izquierda().separador();
    t.texto('Caracteres: áéíóú ñÑ ¿? ¡! $ 1234567890');
    t.separador().avanzar(3).cortar();
    return t.build();
  }

  // Recibo de venta para el cliente (factura PAGADA): encabezado del negocio,
  // detalle de items con precios, totales, pagos y cajero.
  armarTicketFactura(
    factura: FacturaParaImpresion,
    negocio: DatosNegocioTicket | null,
    cajero: string | null,
    anchoPapelMm: number,
  ): Buffer {
    const t = new EscPosBuilder(columnasPorAncho(anchoPapelMm));
    const pedido = factura.subcuenta.pedido;

    // Encabezado del negocio.
    t.centrar().tamanoDoble(true).negrita(true);
    t.texto(negocio?.nombre_negocio ?? 'Factura de venta');
    t.tamanoDoble(false).negrita(false);
    if (negocio?.nit_negocio) t.texto(`NIT ${negocio.nit_negocio}`);
    if (negocio?.direccion_negocio) t.textoEnvuelto(negocio.direccion_negocio);
    if (negocio?.telefono_negocio) t.texto(`Tel: ${negocio.telefono_negocio}`);

    t.izquierda().separador();
    t.negrita(true).texto(`FACTURA DE VENTA No. ${factura.id_factura}`).negrita(false);
    t.texto(this.formatearFecha(factura.fecha_emision_factura));
    if (pedido.tipo_pedido === 'LOCAL') {
      t.texto(pedido.ficha ? `Ficha ${pedido.ficha.numero_ficha}` : 'Sin ficha');
    } else {
      t.texto('DOMICILIO');
      if (pedido.nombre_cliente_pedido) t.texto(`Cliente: ${pedido.nombre_cliente_pedido}`);
      if (pedido.telefono_cliente_pedido) t.texto(`Tel: ${pedido.telefono_cliente_pedido}`);
      if (pedido.direccion_cliente_pedido) t.textoEnvuelto(`Dir: ${pedido.direccion_cliente_pedido}`);
    }
    if (cajero) t.texto(`Cajero: ${cajero}`);

    t.separador();
    for (const item of factura.detalles) {
      this.lineaItemFactura(t, item);
    }
    t.separador();

    // Totales.
    this.lineaDoble(t, 'Subtotal', this.monto(factura.subtotal_factura));
    if (!factura.monto_servicio_factura.isZero()) {
      this.lineaDoble(t, 'Propina', this.monto(factura.monto_servicio_factura));
    }
    if (!factura.monto_impuestos_factura.isZero()) {
      this.lineaDoble(t, 'Impuestos', this.monto(factura.monto_impuestos_factura));
    }
    t.negrita(true);
    this.lineaDoble(t, 'TOTAL', this.monto(factura.monto_total_factura));
    t.negrita(false);

    // Pagos.
    t.separador();
    for (const p of factura.pagos) {
      this.lineaDoble(t, ETIQUETA_METODO_PAGO[p.metodo_pago] ?? p.metodo_pago, this.monto(p.monto_total_pago));
    }
    // Excedente voluntario ("quedese con el vuelto"): se muestra aparte del total.
    for (const p of factura.pagos) {
      if (p.monto_excedente_pago.greaterThan(0)) {
        const etiqueta = p.destino_excedente_pago === 'PROPINA' ? 'Propina adicional' : 'Excedente';
        this.lineaDoble(t, etiqueta, this.monto(p.monto_excedente_pago));
      }
    }

    t.separador();
    t.centrar().texto('Gracias por su compra!').izquierda();
    t.avanzar(3).cortar();
    return t.build();
  }

  private lineaItemFactura(t: EscPosBuilder, item: ItemFactura) {
    const detalle = item.detalleComanda;
    const nombre = detalle.producto?.nombre_producto ?? detalle.combo?.nombre_combo ?? 'Item';
    const cantidad = new Prisma.Decimal(detalle.cantidad_producto_dc).times(item.proporcion_facturada_fd);
    const cantidadTexto = cantidad.isInteger() ? cantidad.toFixed(0) : cantidad.toFixed(2);
    this.lineaDoble(t, `${cantidadTexto} x ${nombre}`, this.monto(item.subtotal_facturado_fd));
  }

  // Linea de dos columnas: etiqueta a la izquierda, valor pegado a la derecha.
  // Si no caben juntos, el valor baja a su propia linea alineado a la derecha.
  private lineaDoble(t: EscPosBuilder, izquierda: string, derecha: string) {
    const espacio = t.columnas - izquierda.length - derecha.length;
    if (espacio < 1) {
      t.texto(izquierda);
      t.texto(' '.repeat(Math.max(0, t.columnas - derecha.length)) + derecha);
    } else {
      t.texto(izquierda + ' '.repeat(espacio) + derecha);
    }
  }

  // Monto en pesos colombianos sin decimales, con separador de miles.
  private monto(valor: Prisma.Decimal): string {
    return `$${Math.round(Number(valor)).toLocaleString('es-CO')}`;
  }

  // Producto directo: se imprime completo en su destino; sus adiciones van
  // cada una al destino de SU categoria (si difiere, con linea de contexto).
  private bloqueProducto(t: EscPosBuilder, detalle: DetalleImpresion, destino: DestinoImpresion) {
    const nombre = detalle.producto?.nombre_producto ?? 'Producto';
    const hijosAqui = detalle.hijos.filter((h) => h.estado_dc !== 'CANCELADO' && destinoDeDetalle(h) === destino);
    const propio = destinoDeDetalle(detalle) === destino;

    if (!propio && hijosAqui.length === 0) return;

    if (propio) {
      t.negrita(true).textoEnvuelto(`${detalle.cantidad_producto_dc} x ${nombre}`).negrita(false);
      this.lineasPersonalizaciones(t, detalle);
      this.lineaIndicaciones(t, detalle.indicaciones_dc);
    } else {
      // Solo llegan adiciones a este destino: dar contexto del plato padre.
      t.textoEnvuelto(`(para ${detalle.cantidad_producto_dc} x ${nombre})`);
    }

    for (const hijo of hijosAqui) {
      this.bloqueHijo(t, hijo);
    }
  }

  // Combo: en cada destino se imprime el nombre del combo como agrupador y
  // debajo SOLO los componentes/adiciones que se preparan ahi.
  private bloqueCombo(t: EscPosBuilder, detalle: DetalleImpresion, destino: DestinoImpresion) {
    const hijosAqui = detalle.hijos.filter((h) => h.estado_dc !== 'CANCELADO' && destinoDeDetalle(h) === destino);
    if (hijosAqui.length === 0) return;

    const nombre = detalle.combo?.nombre_combo ?? 'Combo';
    t.negrita(true).textoEnvuelto(`${detalle.cantidad_producto_dc} x ${nombre}`).negrita(false);
    this.lineaIndicaciones(t, detalle.indicaciones_dc);

    for (const hijo of hijosAqui) {
      this.bloqueHijo(t, hijo);
    }
  }

  private bloqueHijo(t: EscPosBuilder, hijo: HijoImpresion) {
    const nombre = hijo.producto?.nombre_producto ?? 'Producto';
    const esAdicion = !hijo.precio_unitario_dc.isZero();
    t.textoEnvuelto(`  ${esAdicion ? '+ ' : ''}${hijo.cantidad_producto_dc} x ${nombre}`, 4);
    this.lineasPersonalizaciones(t, hijo, 4);
    this.lineaIndicaciones(t, hijo.indicaciones_dc, 4);
  }

  private lineasPersonalizaciones(
    t: EscPosBuilder,
    detalle: { ingredientesPersonalizados: { cantidad_delta: Prisma.Decimal; ingrediente: { nombre_ingrediente: string } }[] },
    sangriaBase = 2,
  ) {
    for (const p of detalle.ingredientesPersonalizados) {
      const etiqueta = p.cantidad_delta.isNegative() ? 'SIN' : 'EXTRA';
      t.textoEnvuelto(`${' '.repeat(sangriaBase)}- ${etiqueta} ${p.ingrediente.nombre_ingrediente}`, sangriaBase + 2);
    }
  }

  private lineaIndicaciones(t: EscPosBuilder, indicaciones: string | null, sangriaBase = 2) {
    if (!indicaciones) return;
    t.textoEnvuelto(`${' '.repeat(sangriaBase)}>> ${indicaciones}`, sangriaBase + 3);
  }

  // El servidor corre en la zona horaria del restaurante (supuesto
  // documentado del proyecto), asi que la hora local es la correcta.
  private formatearFecha(fecha: Date): string {
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const hh = String(fecha.getHours()).padStart(2, '0');
    const mi = String(fecha.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${fecha.getFullYear()} ${hh}:${mi}`;
  }
}
