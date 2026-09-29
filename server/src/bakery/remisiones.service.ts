import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { EntregaRemisionDto } from './dto';
import { fechaColombia } from '../recipes/inventory-reconciliation';

const include = {
  detalles: {
    orderBy: { fechaEntrega: 'asc' as const },
    include: { ingrediente: true },
  },
  cuentaPorPagar: { include: { pagos: true } },
  turno: { include: { caja: true } },
} satisfies Prisma.RemisionPanaderiaInclude;

@Injectable()
export class RemisionesService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.remisionPanaderia.findMany({
      include,
      orderBy: { id: 'desc' },
    });
  }

  destinos() {
    return this.prisma.ingrediente.findMany({
      select: {
        id_ingrediente: true,
        nombre_ingrediente: true,
        unidades_ingrediente: true,
      },
      orderBy: { nombre_ingrediente: 'asc' },
    });
  }

  private async turno(tx: Prisma.TransactionClient, usuarioId: number) {
    const turno = await tx.turno.findFirst({
      where: {
        id_usuario_turno: usuarioId,
        estado_turno: 'ABIERTO',
        caja: { area: 'PANADERIA' },
      },
    });
    if (!turno)
      throw new ConflictException(
        'Abre tu turno de panadería antes de registrar la operación',
      );
    await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
    const actual = await tx.turno.findUniqueOrThrow({
      where: { id_turno: turno.id_turno },
    });
    if (actual.estado_turno !== 'ABIERTO')
      throw new ConflictException('El turno ya se cerró');
    return actual;
  }

  async entregar(usuarioId: number, dto: EntregaRemisionDto) {
    return this.prisma.$transaction(async (tx) => {
      // Misma exclusión por día para elección de modalidad y reintentos.
      const fecha = fechaColombia();
      const fechaClave = fecha.toISOString().slice(0, 10);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`remision:${fechaClave}`})) IS NULL AS bloqueado`;
      const repetida = await tx.detalleRemisionPanaderia.findUnique({
        where: { claveOperacion: dto.claveOperacion },
      });
      if (repetida)
        return tx.remisionPanaderia.findUniqueOrThrow({
          where: { id: repetida.remisionId },
          include,
        });
      const turno = await this.turno(tx, usuarioId);
      if (
        fechaColombia(turno.fecha_apertura_turno).getTime() !== fecha.getTime()
      )
        throw new ConflictException(
          'Cierra el turno del día anterior antes de entregar mercancía',
        );
      const existentes = await tx.remisionPanaderia.findMany({
        where: { fecha: new Date(fecha) },
      });
      if (existentes.some((r) => r.modalidad !== dto.modalidad))
        throw new ConflictException(
          'El día ya usa otra modalidad de remisión. No mezcles por turno y por día',
        );
      const claveAgrupacion =
        dto.modalidad === 'DIA'
          ? `DIA:${fechaClave}`
          : `TURNO:${turno.id_turno}`;
      const remision = await tx.remisionPanaderia.upsert({
        where: { claveAgrupacion },
        update: {},
        create: {
          claveAgrupacion,
          fecha: new Date(fecha),
          modalidad: dto.modalidad,
          turnoId: turno.id_turno,
        },
      });
      await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${remision.id} FOR UPDATE`;
      const estado = await tx.remisionPanaderia.findUniqueOrThrow({
        where: { id: remision.id },
      });
      if (estado.fechaCierre)
        throw new ConflictException(
          'La remisión ya está cerrada; no admite nuevas entregas',
        );
      await tx.$queryRaw`SELECT id FROM "ArticuloPanaderia" WHERE id = ${dto.articuloId} FOR UPDATE`;
      const articulo = await tx.articuloPanaderia.findUnique({
        where: { id: dto.articuloId },
      });
      if (!articulo || !articulo.activo || articulo.tipo === 'INSUMO')
        throw new ConflictException(
          'Selecciona un producto vendible y activo de panadería',
        );
      if (articulo.existencia.lessThan(dto.cantidad))
        throw new ConflictException('Existencia insuficiente');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new ConflictException('La cantidad debe ser entera');
      await tx.$queryRaw`SELECT id_ingrediente FROM "Ingrediente" WHERE id_ingrediente = ${dto.ingredienteDestinoId} FOR UPDATE`;
      const ingrediente = await tx.ingrediente.findUnique({
        where: { id_ingrediente: dto.ingredienteDestinoId },
      });
      if (!ingrediente || ingrediente.unidades_ingrediente !== articulo.unidad)
        throw new ConflictException(
          'El destino debe ser un ingrediente del restaurante con la misma unidad',
        );
      const subtotal = new Prisma.Decimal(dto.precioUnitario).times(
        dto.cantidad,
      );
      const detalle = await tx.detalleRemisionPanaderia.create({
        data: {
          claveOperacion: dto.claveOperacion,
          remisionId: remision.id,
          articuloId: articulo.id,
          ingredienteDestinoId: ingrediente.id_ingrediente,
          usuarioId,
          nombreSnapshot: articulo.nombre,
          cantidad: dto.cantidad,
          precioUnitario: dto.precioUnitario,
          subtotal,
          concepto: dto.concepto.trim(),
        },
      });
      await tx.articuloPanaderia.update({
        where: { id: articulo.id },
        data: { existencia: { decrement: dto.cantidad } },
      });
      await tx.movimientoPanaderia.create({
        data: {
          articuloId: articulo.id,
          usuarioId,
          tipo: 'TRANSFERENCIA',
          cantidad: dto.cantidad,
          existenciaAntes: articulo.existencia,
          existenciaDespues: articulo.existencia.minus(dto.cantidad),
          remisionId: remision.id,
          concepto: `Remisión #${remision.id}, entrega #${detalle.id}`,
        },
      });
      await tx.ingrediente.update({
        where: { id_ingrediente: ingrediente.id_ingrediente },
        data: { stock_ingrediente: { increment: dto.cantidad } },
      });
      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: ingrediente.id_ingrediente,
          id_usuario_movimiento: usuarioId,
          tipo_movimiento: 'ENTRADA',
          cantidad_movimiento: dto.cantidad,
          motivo_movimiento: `Remisión panadería #${remision.id}, entrega #${detalle.id}`,
        },
      });
      return tx.remisionPanaderia.update({
        where: { id: remision.id },
        data: { montoTotal: { increment: subtotal } },
        include,
      });
    });
  }

  async cerrar(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      const turno = await this.turno(tx, usuarioId);
      await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const remision = await tx.remisionPanaderia.findUnique({
        where: { id },
        include: { detalles: true },
      });
      if (!remision) throw new NotFoundException('Remisión no encontrada');
      if (remision.fechaCierre)
        return tx.remisionPanaderia.findUniqueOrThrow({
          where: { id },
          include,
        });
      if (remision.modalidad === 'TURNO' && remision.turnoId !== turno.id_turno)
        throw new ConflictException('La remisión pertenece a otro turno');
      if (
        remision.modalidad === 'DIA' &&
        turno.tipo_turno !== 'UNICO' &&
        turno.tipo_turno !== 'TARDE_NOCHE'
      )
        throw new ConflictException(
          'La remisión diaria se cierra en el turno único o tarde-noche',
        );
      if (
        remision.modalidad === 'DIA' &&
        remision.fecha.getTime() !==
          fechaColombia(turno.fecha_apertura_turno).getTime()
      )
        throw new ConflictException(
          'La remisión diaria pertenece a otra fecha de operación',
        );
      if (remision.detalles.length === 0)
        throw new ConflictException('No hay entregas para cerrar');
      const proveedor = await tx.proveedor.upsert({
        where: {
          area_nombre_proveedor: {
            area: 'RESTAURANTE',
            nombre_proveedor: 'Panadería (remisiones)',
          },
        },
        update: {},
        create: {
          area: 'RESTAURANTE',
          nombre_proveedor: 'Panadería (remisiones)',
        },
      });
      const cuenta = await tx.cuentaPorPagar.create({
        data: {
          area: 'RESTAURANTE',
          id_proveedor_cuentaPorPagar: proveedor.id_proveedor,
          concepto_cuentaPorPagar: `Remisión panadería #${id} · ${remision.modalidad === 'DIA' ? 'día' : 'turno'}`,
          documento_cuentaPorPagar: `REM-PAN-${id}`,
          monto_total_cuentaPorPagar: remision.montoTotal,
          fecha_recepcion_mercancia: new Date(),
          id_usuario_recibe_mercancia: usuarioId,
          observacion_cuentaPorPagar:
            'Las entregas y sus valores se consultan en Remisiones. Pago completo, sin abonos.',
        },
      });
      return tx.remisionPanaderia.update({
        where: { id },
        data: {
          fechaCierre: new Date(),
          cuentaPorPagarId: cuenta.id_cuentaPorPagar,
        },
        include,
      });
    });
  }

  async confirmarIngreso(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      const turno = await this.turno(tx, usuarioId);
      await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const remision = await tx.remisionPanaderia.findUnique({
        where: { id },
        include: { cuentaPorPagar: { include: { pagos: true } } },
      });
      if (!remision) throw new NotFoundException('Remisión no encontrada');
      if (remision.fechaIngreso)
        throw new ConflictException('El ingreso ya fue confirmado');
      const cuenta = remision.cuentaPorPagar;
      if (
        !cuenta ||
        cuenta.estado_cuentaPorPagar !== 'PAGADA' ||
        cuenta.pagos.length !== 1
      )
        throw new ConflictException(
          'Restaurante debe registrar el pago completo antes de confirmar el ingreso',
        );
      const metodo = cuenta.pagos[0].metodo_pagoCuentaPorPagar;
      if (metodo === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            tipo_mc: 'INGRESO',
            monto_mc: remision.montoTotal,
            concepto_mc: `Cobro remisión panadería #${id}`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { increment: remision.montoTotal } },
        });
      }
      return tx.remisionPanaderia.update({
        where: { id },
        data: {
          fechaIngreso: new Date(),
          turnoIngresoId: turno.id_turno,
          metodoIngreso: metodo,
        },
        include,
      });
    });
  }
}
