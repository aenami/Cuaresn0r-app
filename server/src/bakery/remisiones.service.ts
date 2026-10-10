import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AreaNegocio,
  Prisma,
  ReservaPanaderia,
} from '../generated/prisma/client';
import {
  EntregaRemisionDto,
  EntregaListaRemisionDto,
  LineaRemisionDto,
  EditarLineaRemisionDto,
} from './dto';
import { fechaColombia } from '../recipes/inventory-reconciliation';
import { areaActual, exigirArea } from '../auth/access-context';
import { exigirDisponible } from './stock-compartido';

const include = {
  detalles: {
    orderBy: { fechaEntrega: 'asc' as const },
    include: {
      ingrediente: true,
      ingredienteOrigen: true,
      articuloDestino: true,
    },
  },
  cuentaPorPagar: { include: { pagos: true } },
  turno: { include: { caja: true } },
} satisfies Prisma.RemisionPanaderiaInclude;
const otraArea = (area: AreaNegocio): AreaNegocio =>
  area === 'PANADERIA' ? 'RESTAURANTE' : 'PANADERIA';

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
    return areaActual() === 'PANADERIA'
      ? this.prisma.ingrediente.findMany({
          select: {
            id_ingrediente: true,
            nombre_ingrediente: true,
            unidades_ingrediente: true,
          },
          orderBy: { nombre_ingrediente: 'asc' },
        })
      : this.prisma.articuloPanaderia.findMany({
          where: { activo: true, tipo: 'INSUMO' },
          select: { id: true, nombre: true, unidad: true },
          orderBy: { nombre: 'asc' },
        });
  }
  private async turno(
    tx: Prisma.TransactionClient,
    usuarioId: number,
    area = areaActual(),
  ) {
    const turno = await tx.turno.findFirst({
      where: {
        id_usuario_turno: usuarioId,
        estado_turno: 'ABIERTO',
        caja: { area },
      },
    });
    if (!turno)
      throw new ConflictException(
        'Abre tu turno del área antes de registrar la operación',
      );
    await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
    const actual = await tx.turno.findUniqueOrThrow({
      where: { id_turno: turno.id_turno },
    });
    if (actual.estado_turno !== 'ABIERTO')
      throw new ConflictException('El turno ya se cerró');
    if (
      fechaColombia(actual.fecha_apertura_turno).getTime() !==
      fechaColombia().getTime()
    )
      throw new ConflictException('Cierra el turno del día anterior');
    return actual;
  }
  private async agrupar(
    tx: Prisma.TransactionClient,
    origen: AreaNegocio,
    turnoId: number,
    modalidad: 'DIA' | 'TURNO',
  ) {
    const fecha = fechaColombia();
    const dia = fecha.toISOString().slice(0, 10);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`remision:${origen}:${dia}`})) IS NULL AS bloqueado`;
    const existentes = await tx.remisionPanaderia.findMany({
      where: { fecha, areaOrigen: origen },
    });
    if (existentes.some((r) => r.modalidad !== modalidad))
      throw new ConflictException('Este día ya usa otra modalidad de remisión');
    const existente = existentes.find(
      (r) =>
        r.modalidad === modalidad &&
        (modalidad === 'DIA' || r.turnoId === turnoId),
    );
    const remision =
      existente ??
      (await tx.remisionPanaderia.create({
        data: {
          claveAgrupacion: `${origen}:${modalidad === 'DIA' ? dia : turnoId}`,
          fecha,
          modalidad,
          turnoId,
          areaOrigen: origen,
          areaDestino: otraArea(origen),
        },
      }));
    await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${remision.id} FOR UPDATE`;
    const actual = await tx.remisionPanaderia.findUniqueOrThrow({
      where: { id: remision.id },
    });
    if (actual.fechaCierre)
      throw new ConflictException(
        'La remisión ya está cerrada; no admite más entregas',
      );
    return actual;
  }
  entregar(usuarioId: number, dto: EntregaRemisionDto) {
    return this.entregarLista(usuarioId, {
      modalidad: dto.modalidad,
      lineas: [dto],
    });
  }
  async entregarLista(usuarioId: number, dto: EntregaListaRemisionDto) {
    const origen = areaActual();
    if (
      new Set(dto.lineas.map((l) => l.claveOperacion)).size !==
      dto.lineas.length
    )
      throw new ConflictException('Cada línea debe tener una clave diferente');
    return this.prisma.$transaction(
      async (tx) => {
        const turno = await this.turno(tx, usuarioId, origen);
        const previas = await tx.detalleRemisionPanaderia.findMany({
          where: {
            claveOperacion: { in: dto.lineas.map((l) => l.claveOperacion) },
          },
          include: { remision: true },
        });
        if (previas.length) {
          if (
            previas.length !== dto.lineas.length ||
            new Set(previas.map((p) => p.remisionId)).size !== 1 ||
            previas[0].remision.areaOrigen !== origen
          )
            throw new ConflictException(
              'No mezcles líneas ya confirmadas con nuevas',
            );
          for (const p of previas) {
            const l = dto.lineas.find(
              (l) => l.claveOperacion === p.claveOperacion,
            )!;
            if (
              p.articuloId !== (l.articuloId ?? null) ||
              p.ingredienteDestinoId !== (l.ingredienteDestinoId ?? null) ||
              p.ingredienteOrigenId !== (l.ingredienteOrigenId ?? null) ||
              p.articuloDestinoId !== (l.articuloDestinoId ?? null) ||
              !p.cantidad.equals(l.cantidad) ||
              !p.precioUnitario.equals(l.precioUnitario) ||
              p.concepto !== l.concepto.trim() ||
              p.remision.modalidad !== dto.modalidad
            )
              throw new ConflictException(
                'La clave ya fue usada con otros valores',
              );
          }
          return tx.remisionPanaderia.findUniqueOrThrow({
            where: { id: previas[0].remisionId },
            include,
          });
        }
        const remision = await this.agrupar(
          tx,
          origen,
          turno.id_turno,
          dto.modalidad,
        );
        for (const linea of dto.lineas) {
          linea.concepto = linea.concepto.trim();
          if (!linea.concepto)
            throw new ConflictException('Escribe el concepto de cada entrega');
          const nombre = await this.mover(
            tx,
            origen,
            linea,
            usuarioId,
            linea.cantidad,
            remision.id,
          );
          const subtotal = new Prisma.Decimal(linea.cantidad).times(
            linea.precioUnitario,
          );
          await tx.detalleRemisionPanaderia.create({
            data: {
              ...linea,
              concepto: linea.concepto.trim(),
              nombreSnapshot: nombre,
              subtotal,
              remisionId: remision.id,
              usuarioId,
            },
          });
          await tx.remisionPanaderia.update({
            where: { id: remision.id },
            data: { montoTotal: { increment: subtotal } },
          });
        }
        return tx.remisionPanaderia.findUniqueOrThrow({
          where: { id: remision.id },
          include,
        });
      },
      { timeout: 30000 },
    );
  }
  private async mover(
    tx: Prisma.TransactionClient,
    origen: AreaNegocio,
    l: Pick<
      LineaRemisionDto,
      | 'articuloId'
      | 'ingredienteDestinoId'
      | 'ingredienteOrigenId'
      | 'articuloDestinoId'
    >,
    usuarioId: number,
    delta: number,
    remisionId: number,
  ) {
    const pan = origen === 'PANADERIA';
    const articuloId = pan ? l.articuloId : l.articuloDestinoId;
    const ingredienteId = pan ? l.ingredienteDestinoId : l.ingredienteOrigenId;
    if (
      !articuloId ||
      !ingredienteId ||
      (pan
        ? l.ingredienteOrigenId || l.articuloDestinoId
        : l.articuloId || l.ingredienteDestinoId)
    )
      throw new ConflictException(
        'Selecciona origen y destino válidos para esta dirección',
      );
    await tx.$queryRaw`SELECT id FROM "ArticuloPanaderia" WHERE id = ${articuloId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id_ingrediente FROM "Ingrediente" WHERE id_ingrediente = ${ingredienteId} FOR UPDATE`;
    const a = await tx.articuloPanaderia.findUniqueOrThrow({
      where: { id: articuloId },
    });
    const i = await tx.ingrediente.findUniqueOrThrow({
      where: { id_ingrediente: ingredienteId },
    });
    if (
      !a.activo ||
      (pan ? a.tipo === 'INSUMO' : a.tipo !== 'INSUMO') ||
      a.unidad !== i.unidades_ingrediente
    )
      throw new ConflictException(
        'El destino debe usar la misma unidad. Restaurante envía ingredientes a insumos de panadería',
      );
    if (a.unidad === 'UNIDADES' && !Number.isInteger(delta))
      throw new ConflictException('La cantidad debe ser entera');
    const deltaPan = pan ? -delta : delta;
    const deltaRest = -deltaPan;
    if (deltaPan < 0) await exigirDisponible(tx, a.id, a.existencia, -deltaPan);
    if (i.stock_ingrediente.plus(deltaRest).lessThan(0))
      throw new ConflictException(
        'El ingrediente receptor ya fue consumido; no puedes revertir esa cantidad',
      );
    await tx.articuloPanaderia.update({
      where: { id: a.id },
      data: { existencia: { increment: deltaPan } },
    });
    await tx.ingrediente.update({
      where: { id_ingrediente: i.id_ingrediente },
      data: { stock_ingrediente: { increment: deltaRest } },
    });
    if (delta) {
      await tx.movimientoPanaderia.create({
        data: {
          articuloId: a.id,
          usuarioId,
          tipo: deltaPan < 0 ? 'TRANSFERENCIA' : 'RECEPCION',
          cantidad: Math.abs(deltaPan),
          existenciaAntes: a.existencia,
          existenciaDespues: a.existencia.plus(deltaPan),
          remisionId,
          concepto: `Remisión #${remisionId}${delta < 0 ? ' · corrección' : ''}`,
        },
      });
      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: i.id_ingrediente,
          id_usuario_movimiento: usuarioId,
          tipo_movimiento: deltaRest > 0 ? 'ENTRADA' : 'TRANSFERENCIA',
          cantidad_movimiento: Math.abs(deltaRest),
          motivo_movimiento: `Remisión #${remisionId}${delta < 0 ? ' · corrección' : ''}`,
        },
      });
    }
    return pan ? a.nombre : i.nombre_ingrediente;
  }
  async editarLinea(
    id: number,
    usuarioId: number,
    dto: EditarLineaRemisionDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.turno(tx, usuarioId);
        const linea = await tx.detalleRemisionPanaderia.findUnique({
          where: { id },
          include: { remision: true },
        });
        if (!linea) throw new NotFoundException('Entrega no encontrada');
        exigirArea(linea.remision.areaOrigen);
        await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${linea.remisionId} FOR UPDATE`;
        const actual = await tx.detalleRemisionPanaderia.findUniqueOrThrow({
          where: { id },
          include: { remision: true },
        });
        if (actual.remision.fechaCierre || actual.detalleComandaId)
          throw new ConflictException(
            'Solo se editan entregas manuales de remisiones abiertas',
          );
        if (actual.remision.fecha.getTime() !== fechaColombia().getTime())
          throw new ConflictException(
            'Solo corrige entregas del día actual antes del cierre',
          );
        dto.concepto = dto.concepto.trim();
        if (!dto.concepto)
          throw new ConflictException('Escribe el concepto de la entrega');
        await this.mover(
          tx,
          actual.remision.areaOrigen,
          {
            articuloId: actual.articuloId ?? undefined,
            ingredienteDestinoId: actual.ingredienteDestinoId ?? undefined,
            ingredienteOrigenId: actual.ingredienteOrigenId ?? undefined,
            articuloDestinoId: actual.articuloDestinoId ?? undefined,
          },
          usuarioId,
          dto.cantidad - Number(actual.cantidad),
          actual.remisionId,
        );
        const subtotal = new Prisma.Decimal(dto.cantidad).times(
          dto.precioUnitario,
        );
        const historia = Array.isArray(actual.historialEdiciones)
          ? actual.historialEdiciones
          : [];
        await tx.detalleRemisionPanaderia.update({
          where: { id },
          data: {
            ...dto,
            subtotal,
            historialEdiciones: [
              ...historia,
              {
                usuarioId,
                fecha: new Date().toISOString(),
                cantidad: actual.cantidad.toString(),
                precioUnitario: actual.precioUnitario.toString(),
                concepto: actual.concepto,
              },
            ],
          },
        });
        return tx.remisionPanaderia.update({
          where: { id: actual.remisionId },
          data: { montoTotal: { increment: subtotal.minus(actual.subtotal) } },
          include,
        });
      },
      { timeout: 20000 },
    );
  }
  async entregarCompartido(
    tx: Prisma.TransactionClient,
    reserva: ReservaPanaderia,
    usuarioId: number,
  ) {
    const turno = await tx.turno.findFirst({
      where: { estado_turno: 'ABIERTO', caja: { area: 'PANADERIA' } },
    });
    if (!turno)
      throw new ConflictException(
        'Panadería debe tener un turno abierto para entregar panes compartidos',
      );
    await tx.$queryRaw`SELECT id_turno FROM "Turno" WHERE id_turno = ${turno.id_turno} FOR UPDATE`;
    const vigente = await tx.turno.findUniqueOrThrow({
      where: { id_turno: turno.id_turno },
    });
    if (
      vigente.estado_turno !== 'ABIERTO' ||
      fechaColombia(vigente.fecha_apertura_turno).getTime() !==
        fechaColombia().getTime()
    )
      throw new ConflictException(
        'El turno de panadería no corresponde al día actual',
      );
    const existentes = await tx.remisionPanaderia.findMany({
      where: { fecha: fechaColombia(), areaOrigen: 'PANADERIA' },
    });
    const modalidad = existentes[0]?.modalidad === 'TURNO' ? 'TURNO' : 'DIA';
    const remision = await this.agrupar(
      tx,
      'PANADERIA',
      turno.id_turno,
      modalidad,
    );
    await tx.$queryRaw`SELECT id FROM "ArticuloPanaderia" WHERE id = ${reserva.articuloId} FOR UPDATE`;
    const a = await tx.articuloPanaderia.findUniqueOrThrow({
      where: { id: reserva.articuloId },
    });
    if (a.existencia.lessThan(reserva.cantidad))
      throw new ConflictException(
        'La existencia física ya no cubre la reserva',
      );
    const subtotal = reserva.cantidad.times(reserva.precioInterno);
    await tx.detalleRemisionPanaderia.create({
      data: {
        claveOperacion: `pedido:${reserva.detalleId}`,
        remisionId: remision.id,
        articuloId: a.id,
        detalleComandaId: reserva.detalleId,
        usuarioId,
        nombreSnapshot: a.nombre,
        cantidad: reserva.cantidad,
        precioUnitario: reserva.precioInterno,
        subtotal,
        concepto: `Entrega directa para pedido · producto #${reserva.detalleId}`,
      },
    });
    await tx.articuloPanaderia.update({
      where: { id: a.id },
      data: { existencia: { decrement: reserva.cantidad } },
    });
    await tx.movimientoPanaderia.create({
      data: {
        articuloId: a.id,
        usuarioId,
        tipo: 'TRANSFERENCIA',
        cantidad: reserva.cantidad,
        existenciaAntes: a.existencia,
        existenciaDespues: a.existencia.minus(reserva.cantidad),
        remisionId: remision.id,
        concepto: `Remisión #${remision.id} · entrega pedido #${reserva.detalleId}`,
      },
    });
    await tx.remisionPanaderia.update({
      where: { id: remision.id },
      data: { montoTotal: { increment: subtotal } },
    });
  }
  async cerrar(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      const turno = await this.turno(tx, usuarioId);
      await tx.$queryRaw`SELECT id FROM "RemisionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const r = await tx.remisionPanaderia.findUnique({
        where: { id },
        include: { detalles: true },
      });
      if (!r) throw new NotFoundException('Remisión no encontrada');
      exigirArea(r.areaOrigen);
      if (r.fechaCierre)
        return tx.remisionPanaderia.findUniqueOrThrow({
          where: { id },
          include,
        });
      if (r.modalidad === 'TURNO' && r.turnoId !== turno.id_turno)
        throw new ConflictException('Pertenece a otro turno');
      if (
        r.modalidad === 'DIA' &&
        (turno.tipo_turno === 'MANANA' ||
          r.fecha.getTime() !==
            fechaColombia(turno.fecha_apertura_turno).getTime())
      )
        throw new ConflictException(
          'La remisión diaria se cierra al finalizar el día correspondiente',
        );
      if (!r.detalles.length) throw new ConflictException('No hay entregas');
      const nombre =
        r.areaOrigen === 'PANADERIA'
          ? 'Panadería (remisiones)'
          : 'Restaurante (remisiones)';
      const proveedor = await tx.proveedor.upsert({
        where: {
          area_nombre_proveedor: {
            area: r.areaDestino,
            nombre_proveedor: nombre,
          },
        },
        update: {},
        create: { area: r.areaDestino, nombre_proveedor: nombre },
      });
      const cuenta = await tx.cuentaPorPagar.create({
        data: {
          area: r.areaDestino,
          id_proveedor_cuentaPorPagar: proveedor.id_proveedor,
          concepto_cuentaPorPagar: `Remisión #${id} · ${r.areaOrigen}`,
          documento_cuentaPorPagar: `REM-${id}`,
          monto_total_cuentaPorPagar: r.montoTotal,
          fecha_recepcion_mercancia: new Date(),
          id_usuario_recibe_mercancia: usuarioId,
          observacion_cuentaPorPagar:
            'Entregas registradas en Remisiones. Pago completo, sin abonos.',
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
      const r = await tx.remisionPanaderia.findUnique({
        where: { id },
        include: { cuentaPorPagar: { include: { pagos: true } } },
      });
      if (!r) throw new NotFoundException('Remisión no encontrada');
      exigirArea(r.areaOrigen);
      if (r.fechaIngreso)
        throw new ConflictException('El ingreso ya fue confirmado');
      if (
        !r.cuentaPorPagar ||
        r.cuentaPorPagar.estado_cuentaPorPagar !== 'PAGADA' ||
        r.cuentaPorPagar.pagos.length !== 1
      )
        throw new ConflictException(
          'El área receptora debe pagar completo antes de confirmar el ingreso',
        );
      const metodo = r.cuentaPorPagar.pagos[0].metodo_pagoCuentaPorPagar;
      if (metodo === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            tipo_mc: 'INGRESO',
            monto_mc: r.montoTotal,
            concepto_mc: `Cobro remisión #${id}`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { increment: r.montoTotal } },
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
