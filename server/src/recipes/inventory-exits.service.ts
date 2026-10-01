import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rangoDia } from './inventory-reconciliation';
import { CreateProductExitDto } from './dto/create-product-exit.dto';

@Injectable()
export class InventoryExitsService {
  constructor(private readonly prisma: PrismaService) {}

  async registrarProducto(dto: CreateProductExitDto, usuarioId: number) {
    const motivo = dto.motivo?.trim();
    if (!motivo) throw new BadRequestException('Indica el motivo de la salida');
    if (!Number.isSafeInteger(dto.cantidad) || dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser un entero positivo');
    }
    const producto = await this.prisma.producto.findUnique({
      where: { id_producto: dto.productoId },
      select: { habilitado_producto: true },
    });
    if (!producto?.habilitado_producto) {
      throw new NotFoundException('Producto habilitado no encontrado');
    }
    // Producto de carta no tiene stock cacheado: solo se documenta la salida.
    // La hoja diaria la compara con el conteo físico; no crea ventas ni cobros.
    return this.prisma.salidaProductoRestaurante.create({
      data: { productoId: dto.productoId, cantidad: dto.cantidad, motivo, usuarioId },
    });
  }

  async listar(fechaTexto?: string) {
    const fecha = fechaTexto ? this.parsearFecha(fechaTexto) : this.fechaHoy();
    const { inicio, fin } = rangoDia(fecha);
    const [productos, ingredientes] = await Promise.all([
      this.prisma.salidaProductoRestaurante.findMany({
        where: { fecha: { gte: inicio, lt: fin } },
        select: {
          id: true, productoId: true, cantidad: true, motivo: true, fecha: true,
          producto: { select: { nombre_producto: true } },
          usuario: { select: { email_usuario: true } },
        },
      }),
      this.prisma.movimientoInventario.findMany({
        where: {
          tipo_movimiento: { in: ['MERMA', 'SALIDA_MANUAL'] },
          fecha_movimiento: { gte: inicio, lt: fin },
        },
        select: {
          id_movimiento: true,
          id_ingrediente_movimiento: true,
          tipo_movimiento: true,
          cantidad_movimiento: true,
          motivo_movimiento: true,
          fecha_movimiento: true,
          ingrediente: { select: { nombre_ingrediente: true, unidades_ingrediente: true } },
          usuario: { select: { email_usuario: true } },
        },
      }),
    ]);
    return [
      ...productos.map((salida) => ({
        id: `PRODUCTO:${salida.id}`,
        tipo: 'PRODUCTO' as const,
        objetivoId: salida.productoId,
        nombre: salida.producto.nombre_producto,
        cantidad: salida.cantidad.toString(),
        unidad: 'UNIDADES' as const,
        motivo: salida.motivo,
        fecha: salida.fecha,
        usuario: salida.usuario.email_usuario,
      })),
      ...ingredientes.map((salida) => ({
        id: `INGREDIENTE:${salida.id_movimiento}`,
        tipo: 'INGREDIENTE' as const,
        clase: salida.tipo_movimiento,
        objetivoId: salida.id_ingrediente_movimiento,
        nombre: salida.ingrediente.nombre_ingrediente,
        cantidad: salida.cantidad_movimiento.toString(),
        unidad: salida.ingrediente.unidades_ingrediente,
        motivo: salida.motivo_movimiento ?? 'Merma sin motivo histórico',
        fecha: salida.fecha_movimiento,
        usuario: salida.usuario?.email_usuario ?? 'Sin responsable histórico',
      })),
    ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  private parsearFecha(texto: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
    }
    const fecha = new Date(`${texto}T00:00:00Z`);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) {
      throw new BadRequestException('La fecha no es valida');
    }
    return fecha;
  }

  private fechaHoy() {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value;
    return this.parsearFecha(`${valor('year')}-${valor('month')}-${valor('day')}`);
  }
}
