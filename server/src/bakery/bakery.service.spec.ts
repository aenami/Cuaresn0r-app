import { Prisma } from '../generated/prisma/client';
import { BakeryService, resumenConteo } from './bakery.service';
import { PrismaService } from '../prisma/prisma.service';

const decimal = (valor: number) => new Prisma.Decimal(valor);

describe('conciliacion de inventario de panaderia', () => {
  it('muestra como diferencia lo que falta frente a las ventas registradas', () => {
    expect(resumenConteo({
      cantidadInicial: decimal(20),
      entradas: decimal(10),
      ventasRegistradas: decimal(7),
      transferencias: decimal(2),
      mermas: decimal(1),
      cantidadFisica: decimal(17),
      precioReferencia: decimal(2500),
    })).toEqual({
      salidaFisica: '13',
      ventaFisicaEstimada: '10',
      diferenciaUnidades: '3',
      valorDiferencia: '7500',
    });
  });

  it('no confunde una merma o traslado registrado con una venta', () => {
    expect(resumenConteo({
      cantidadInicial: decimal(10),
      entradas: decimal(0),
      ventasRegistradas: decimal(4),
      transferencias: decimal(2),
      mermas: decimal(1),
      cantidadFisica: decimal(3),
      precioReferencia: decimal(3000),
    }).diferenciaUnidades).toBe('0');
  });

  it('requiere recontar si hubo una salida despues del conteo', async () => {
    const fechaRegistro = new Date('2026-09-24T22:00:00Z');
    const articulo = { id: 1, nombre: 'Pan', activo: true, existencia: decimal(10), precioVenta: decimal(2500) };
    const conteo = {
      articuloId: 1,
      articulo,
      cantidadInicial: decimal(12),
      entradas: decimal(3),
      ventasRegistradas: decimal(5),
      transferencias: decimal(0),
      mermas: decimal(0),
      cantidadFisica: decimal(10),
      precioReferencia: decimal(2500),
      fechaRegistro,
    };
    const prisma = {
      articuloPanaderia: { findMany: jest.fn().mockResolvedValue([articulo]) },
      conteoPanaderia: { findMany: jest.fn().mockResolvedValue([conteo]) },
      movimientoPanaderia: { findMany: jest.fn().mockResolvedValue([{
        articuloId: 1,
        tipo: 'VENTA',
        cantidad: decimal(1),
        existenciaAntes: decimal(11),
        fecha: new Date('2026-09-24T22:05:00Z'),
      }]) },
    } as unknown as PrismaService;
    const servicio = new BakeryService(prisma);
    const estado = await servicio.estadoConteo(new Date('2026-09-24T05:00:00Z'));
    expect(estado.completo).toBe(false);
    expect(estado.recontar).toEqual(['Pan']);
    expect(estado.proyeccion[0].cantidadInicial.toString()).toBe('12');
  });
});
