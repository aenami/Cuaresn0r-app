import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategoryExists(idCategoria: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id_categoria: idCategoria },
    });
    if (!categoria)
      throw new UnprocessableEntityException('La categoria indicada no existe');
  }

  async create(dto: CreateProductDto) {
    await this.validarEspecial(dto);
    if (dto.category !== undefined)
      await this.assertCategoryExists(dto.category);

    return this.prisma.producto.create({
      data: {
        nombre_producto: dto.name,
        precio_producto: dto.price,
        articuloCompartidoId: dto.articuloCompartidoId,
        precioInternoCompartido: dto.precioInternoCompartido,
        tipoMenu: dto.tipoMenu,
        ...(dto.description !== undefined && {
          descripcion_producto: dto.description,
        }),
        ...(dto.category !== undefined && { categoria_producto: dto.category }),
        ...(dto.image !== undefined && { imagen_producto: dto.image }),
      },
    });
  }

  async findAll(habilitado?: boolean) {
    return this.prisma.producto.findMany({
      where:
        habilitado !== undefined
          ? { habilitado_producto: habilitado }
          : undefined,
      include: { categoria: true },
      orderBy: { id_producto: 'asc' },
    });
  }
  compartibles() {
    return this.prisma.articuloPanaderia.findMany({
      where: { activo: true, tipo: { not: 'INSUMO' }, unidad: 'UNIDADES' },
      select: { id: true, nombre: true, precioVenta: true },
      orderBy: { nombre: 'asc' },
    });
  }
  async disponibilidadCompartida() {
    const productos = await this.prisma.producto.findMany({
      where: { habilitado_producto: true, articuloCompartidoId: { not: null } },
      include: { articuloCompartido: true },
    });
    const reservas = await this.prisma.reservaPanaderia.groupBy({
      by: ['articuloId'],
      where: {
        estado: 'RESERVADA',
        articuloId: { in: productos.map((p) => p.articuloCompartidoId!) },
      },
      _sum: { cantidad: true },
    });
    const porId = new Map(
      reservas.map((r) => [r.articuloId, Number(r._sum.cantidad ?? 0)]),
    );
    return productos.map((p) => ({
      idProducto: p.id_producto,
      nombre: p.nombre_producto,
      existencia: Number(p.articuloCompartido?.existencia ?? 0),
      reservado: porId.get(p.articuloCompartidoId!) ?? 0,
      disponible: p.articuloCompartido?.activo
        ? Math.max(
            0,
            Number(p.articuloCompartido.existencia) -
              (porId.get(p.articuloCompartidoId!) ?? 0),
          )
        : 0,
    }));
  }

  async findOne(id: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { id_producto: id },
      include: { categoria: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  async update(id: number, dto: UpdateProductDto) {
    const actual = await this.findOne(id);
    const articuloId =
      dto.articuloCompartidoId === undefined
        ? actual.articuloCompartidoId
        : dto.articuloCompartidoId;
    if (
      dto.articuloCompartidoId === null &&
      dto.precioInternoCompartido != null
    )
      throw new UnprocessableEntityException(
        'El valor interno requiere un producto compartido',
      );
    if (
      articuloId &&
      (await this.prisma.receta.findFirst({
        where: { id_producto_receta: id, receta_activa: true },
      }))
    )
      throw new UnprocessableEntityException(
        'Desactiva la receta propia antes de vincular stock compartido',
      );
    await this.validarEspecial({
      articuloCompartidoId:
        dto.articuloCompartidoId === undefined
          ? actual.articuloCompartidoId
          : dto.articuloCompartidoId,
      precioInternoCompartido:
        dto.articuloCompartidoId === null
          ? null
          : dto.precioInternoCompartido === undefined
            ? actual.precioInternoCompartido === null
              ? null
              : Number(actual.precioInternoCompartido)
            : dto.precioInternoCompartido,
      tipoMenu: dto.tipoMenu === undefined ? actual.tipoMenu : dto.tipoMenu,
    });
    if (dto.category !== undefined)
      await this.assertCategoryExists(dto.category);

    return this.prisma.producto.update({
      where: { id_producto: id },
      data: {
        ...(dto.articuloCompartidoId !== undefined && {
          articuloCompartidoId: dto.articuloCompartidoId,
          ...(dto.articuloCompartidoId === null && {
            precioInternoCompartido: null,
          }),
        }),
        ...(dto.precioInternoCompartido !== undefined && {
          precioInternoCompartido: dto.precioInternoCompartido,
        }),
        ...(dto.tipoMenu !== undefined && { tipoMenu: dto.tipoMenu }),
        ...(dto.name !== undefined && { nombre_producto: dto.name }),
        ...(dto.price !== undefined && { precio_producto: dto.price }),
        ...(dto.description !== undefined && {
          descripcion_producto: dto.description,
        }),
        ...(dto.category !== undefined && { categoria_producto: dto.category }),
        ...(dto.image !== undefined && { imagen_producto: dto.image }),
      },
    });
  }

  // "Eliminar" un producto = quitarlo del menu (soft), nunca borrado fisico:
  private async validarEspecial(dto: {
    articuloCompartidoId?: number | null;
    precioInternoCompartido?: number | null;
    tipoMenu?: string | null;
  }) {
    if (dto.articuloCompartidoId) {
      const articulo = await this.prisma.articuloPanaderia.findUnique({
        where: { id: dto.articuloCompartidoId },
      });
      if (
        !articulo?.activo ||
        articulo.tipo === 'INSUMO' ||
        articulo.unidad !== 'UNIDADES' ||
        !dto.precioInternoCompartido ||
        dto.tipoMenu
      )
        throw new UnprocessableEntityException(
          'Selecciona un producto activo de panadería en unidades, con valor interno y sin menú configurable',
        );
    } else if (dto.precioInternoCompartido)
      throw new UnprocessableEntityException(
        'El valor interno requiere un producto compartido',
      );
  }
  // preserva la trazabilidad de Recetas/Combos/DetalleComanda que ya lo referencian.
  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { habilitado_producto: false },
    });
  }

  async enable(id: number) {
    await this.findOne(id);
    return this.prisma.producto.update({
      where: { id_producto: id },
      data: { habilitado_producto: true },
    });
  }
}
