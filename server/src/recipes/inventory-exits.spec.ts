import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryExitsService } from './inventory-exits.service';

function setup(producto = { habilitado_producto: true }) {
  const prisma = {
    producto: { findUnique: jest.fn().mockResolvedValue(producto) },
    salidaProductoRestaurante: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    movimientoInventario: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { service: new InventoryExitsService(prisma), prisma };
}

describe('Salidas manuales de productos de restaurante', () => {
  it('exige producto habilitado, cantidad entera positiva y motivo no vacío', async () => {
    const { service, prisma } = setup();
    await expect(service.registrarProducto({ productoId: 5, cantidad: 1.5, motivo: 'Roto' }, 9))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registrarProducto({ productoId: 5, cantidad: 1, motivo: '   ' }, 9))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.salidaProductoRestaurante.create).not.toHaveBeenCalled();
    await expect(setup({ habilitado_producto: false }).service.registrarProducto(
      { productoId: 5, cantidad: 1, motivo: 'Roto' }, 9,
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persiste el hecho físico con responsable y motivo, sin registrar venta ni tocar stock', async () => {
    const { service, prisma } = setup();
    await service.registrarProducto({ productoId: 5, cantidad: 2, motivo: '  dañado  ' }, 9);
    expect(prisma.salidaProductoRestaurante.create).toHaveBeenCalledWith({
      data: { productoId: 5, cantidad: 2, motivo: 'dañado', usuarioId: 9 },
    });
  });

  it('consulta por día de Colombia y combina productos e ingredientes con motivo', async () => {
    const { service, prisma } = setup();
    (prisma.salidaProductoRestaurante.findMany as jest.Mock).mockResolvedValue([{
      id: 2, productoId: 5, cantidad: 2, motivo: 'Dañado',
      fecha: new Date('2026-09-22T07:00:00Z'),
      producto: { nombre_producto: 'Pan' }, usuario: { email_usuario: 'caja@local' },
    }]);
    (prisma.movimientoInventario.findMany as jest.Mock).mockResolvedValue([{
      id_movimiento: 4, id_ingrediente_movimiento: 8, cantidad_movimiento: { toString: () => '0.5' },
      tipo_movimiento: 'SALIDA_MANUAL',
      motivo_movimiento: 'Derrame', fecha_movimiento: new Date('2026-09-22T15:00:00Z'),
      ingrediente: { nombre_ingrediente: 'Harina', unidades_ingrediente: 'kg' },
      usuario: { email_usuario: 'cocina@local' },
    }]);
    const resultado = await service.listar('2026-09-22');
    expect(prisma.salidaProductoRestaurante.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { fecha: { gte: new Date('2026-09-22T05:00:00Z'), lt: new Date('2026-09-23T05:00:00Z') } },
    }));
    expect(resultado).toMatchObject([
      { tipo: 'INGREDIENTE', clase: 'SALIDA_MANUAL', motivo: 'Derrame', cantidad: '0.5' },
      { tipo: 'PRODUCTO', motivo: 'Dañado', cantidad: '2' },
    ]);
    await expect(service.listar('2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
  });
});
