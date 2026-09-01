import * as iconv from 'iconv-lite';
import { TicketBuilderService, FacturaParaImpresion, DatosNegocioTicket } from './ticket-builder.service';
import { Prisma } from '../generated/prisma/client';

// armarTicketFactura arma el recibo de venta para el cliente. Es logica pura
// (sin prisma): se ejecuta y se decodifica el buffer ESC/POS (CP850) para
// verificar que el texto esperado quedo en el papel.

const negocio: DatosNegocioTicket = {
  nombre_negocio: 'Mi Restaurante',
  nit_negocio: '900123456-7',
  direccion_negocio: 'Av Siempre Viva 742',
  telefono_negocio: '6041234',
};

// Fabrica una factura con la forma que consume el builder (se castea porque solo
// se usan los campos aqui presentes). El detalle ya no se infiere de toda la
// subcuenta: FacturaDetalle congela exactamente que productos se cobraron.
function factura(over: Partial<{ ficha: string | null; cliente: Record<string, string>; servicio: number; impuestos: number; excedente: number; destinoExcedente: string }> = {}): FacturaParaImpresion {
  const { ficha = '05', cliente, servicio = 4300, impuestos = 0, excedente = 0, destinoExcedente = 'CASA' } = over;
  return {
    id_factura: 42,
    fecha_emision_factura: new Date('2026-07-17T13:30:00'),
    subtotal_factura: new Prisma.Decimal(43000),
    monto_servicio_factura: new Prisma.Decimal(servicio),
    monto_impuestos_factura: new Prisma.Decimal(impuestos),
    monto_total_factura: new Prisma.Decimal(43000 + servicio + impuestos),
    pagos: [
      {
        metodo_pago: 'EFECTIVO',
        monto_total_pago: new Prisma.Decimal(43000 + servicio + impuestos),
        monto_excedente_pago: new Prisma.Decimal(excedente),
        destino_excedente_pago: excedente > 0 ? destinoExcedente : null,
      },
    ],
    subcuenta: {
      pedido: {
        tipo_pedido: cliente ? 'DOMICILIO' : 'LOCAL',
        ficha: ficha ? { numero_ficha: ficha } : null,
        nombre_cliente_pedido: cliente?.nombre ?? null,
        telefono_cliente_pedido: cliente?.telefono ?? null,
        direccion_cliente_pedido: cliente?.direccion ?? null,
      },
    },
    detalles: [
      {
        proporcion_facturada_fd: new Prisma.Decimal(1),
        subtotal_facturado_fd: new Prisma.Decimal(40000),
        detalleComanda: {
          producto: { nombre_producto: 'Pizza' },
          combo: null,
          precio_unitario_dc: new Prisma.Decimal(20000),
          cantidad_producto_dc: 2,
        },
      },
      {
        proporcion_facturada_fd: new Prisma.Decimal(1),
        subtotal_facturado_fd: new Prisma.Decimal(3000),
        detalleComanda: {
          producto: { nombre_producto: 'Queso extra' },
          combo: null,
          precio_unitario_dc: new Prisma.Decimal(3000),
          cantidad_producto_dc: 1,
        },
      },
      {
        proporcion_facturada_fd: new Prisma.Decimal(1),
        subtotal_facturado_fd: new Prisma.Decimal(0),
        detalleComanda: {
          producto: { nombre_producto: 'Gaseosa' },
          combo: null,
          precio_unitario_dc: new Prisma.Decimal(0),
          cantidad_producto_dc: 1,
        },
      },
    ],
  } as unknown as FacturaParaImpresion;
}

function imprimir(f: FacturaParaImpresion, neg: DatosNegocioTicket | null = negocio, cajero: string | null = 'Pedro'): string {
  const buffer = new TicketBuilderService().armarTicketFactura(f, neg, cajero, 80);
  return iconv.decode(buffer, 'cp850');
}

describe('TicketBuilderService.armarTicketFactura', () => {
  it('imprime el encabezado del negocio, el numero de factura y el cajero', () => {
    const out = imprimir(factura());
    expect(out).toContain('Mi Restaurante');
    expect(out).toContain('NIT 900123456-7');
    expect(out).toContain('Av Siempre Viva 742');
    expect(out).toContain('Tel: 6041234');
    expect(out).toContain('FACTURA DE VENTA No. 42');
    expect(out).toContain('Cajero: Pedro');
  });

  it('lista exactamente los items que quedaron congelados en la factura', () => {
    const out = imprimir(factura());
    expect(out).toContain('2 x Pizza');
    expect(out).toContain('1 x Queso extra');
    expect(out).toContain('1 x Gaseosa');
  });

  it('muestra la propina solo cuando no es cero y omite los impuestos en cero', () => {
    const out = imprimir(factura({ servicio: 4300, impuestos: 0 }));
    expect(out).toContain('Subtotal');
    expect(out).toContain('Propina');
    expect(out).not.toContain('Impuestos');
    expect(out).toContain('TOTAL');
    expect(out).toContain('Efectivo');
  });

  it('omite la propina cuando es cero y muestra impuestos cuando aplican', () => {
    const out = imprimir(factura({ servicio: 0, impuestos: 8170 }));
    expect(out).not.toContain('Propina');
    expect(out).toContain('Impuestos');
  });

  it('en un pedido local imprime la ficha; sin cliente no muestra DOMICILIO', () => {
    const out = imprimir(factura());
    expect(out).toContain('Ficha 05');
    expect(out).not.toContain('DOMICILIO');
  });

  it('en un domicilio imprime los datos del cliente en vez de la mesa', () => {
    const out = imprimir(factura({ cliente: { nombre: 'Ana', telefono: '3001234567', direccion: 'Calle 10 #5-20' } }));
    expect(out).toContain('DOMICILIO');
    expect(out).toContain('Cliente: Ana');
    expect(out).toContain('Tel: 3001234567');
    expect(out).toContain('Dir: Calle 10 #5-20');
    expect(out).not.toContain('Ficha 05');
  });

  it('sin datos del negocio usa un encabezado generico', () => {
    const out = imprimir(factura(), null);
    expect(out).toContain('Factura de venta');
    expect(out).not.toContain('NIT');
  });

  it('muestra el excedente voluntario aparte, etiquetado segun su destino', () => {
    expect(imprimir(factura({ excedente: 10000, destinoExcedente: 'CASA' }))).toContain('Excedente');
    expect(imprimir(factura({ excedente: 10000, destinoExcedente: 'PROPINA' }))).toContain('Propina adicional');
    // Sin excedente no aparece ninguna de las dos etiquetas.
    const sin = imprimir(factura());
    expect(sin).not.toContain('Excedente');
    expect(sin).not.toContain('Propina adicional');
  });
});
