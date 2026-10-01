import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoMetaProduccion,
  Prisma,
  TipoArticuloPanaderia,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fechaColombia } from '../recipes/inventory-reconciliation';
import { BakeryService } from './bakery.service';
import { CrearMetaPanaderiaDto, RegistrarEntradaHojaDto } from './production.dto';

const HOJA_INCLUDE = {
  panadero: {
    select: {
      id_usuario: true,
      email_usuario: true,
      empleado: { select: { nombre_empleado: true, apellido_empleado: true } },
    },
  },
  entradas: {
    select: {
      id: true,
      articuloId: true,
      nombreArticuloSnapshot: true,
      tipoSnapshot: true,
      cantidad: true,
      precioUnitarioSnapshot: true,
      subtotal: true,
      fechaRegistro: true,
    },
    orderBy: [{ fechaRegistro: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.HojaProduccionPanaderiaInclude;

const META_INCLUDE = {
  articulo: {
    select: { id: true, nombre: true, tipo: true, activo: true, categoriaId: true },
  },
  usuarioCrea: {
    select: { id_usuario: true, email_usuario: true },
  },
  usuarioResuelve: {
    select: { id_usuario: true, email_usuario: true },
  },
} as const satisfies Prisma.MetaProduccionPanaderiaInclude;

type HojaConEntradas = Prisma.HojaProduccionPanaderiaGetPayload<{ include: typeof HOJA_INCLUDE }>;

function parsearFecha(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
  const resultado = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(resultado.getTime()) || resultado.toISOString().slice(0, 10) !== fecha)
    throw new BadRequestException('La fecha no es valida');
  return resultado;
}

function esProductoProducido(tipo: TipoArticuloPanaderia) {
  return tipo === 'PANADERIA' || tipo === 'PASTELERIA';
}

@Injectable()
export class ProductionSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bakery: BakeryService,
  ) {}

  private presentar(hoja: HojaConEntradas) {
    const panes = { cantidad: new Prisma.Decimal(0), valor: new Prisma.Decimal(0) };
    const postres = { cantidad: new Prisma.Decimal(0), valor: new Prisma.Decimal(0) };
    for (const entrada of hoja.entradas) {
      const grupo = entrada.tipoSnapshot === 'PANADERIA' ? panes : postres;
      grupo.cantidad = grupo.cantidad.plus(entrada.cantidad);
      grupo.valor = grupo.valor.plus(entrada.subtotal);
    }
    return {
      ...hoja,
      resumen: {
        PANADERIA: { cantidad: panes.cantidad.toString(), valor: panes.valor.toString() },
        PASTELERIA: { cantidad: postres.cantidad.toString(), valor: postres.valor.toString() },
        cantidadTotal: panes.cantidad.plus(postres.cantidad).toString(),
        valorTotal: panes.valor.plus(postres.valor).toString(),
      },
    };
  }

  async listar(fecha: string | undefined, usuarioId: number, rol: string) {
    const dia = fecha ? parsearFecha(fecha) : fechaColombia();
    const hojas = await this.prisma.hojaProduccionPanaderia.findMany({
      where: { fecha: dia, ...(rol === 'PANADERO' ? { panaderoId: usuarioId } : {}) },
      include: HOJA_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return hojas.map((hoja) => this.presentar(hoja));
  }

  async obtener(id: number, usuarioId: number, rol: string) {
    const hoja = await this.prisma.hojaProduccionPanaderia.findUnique({
      where: { id }, include: HOJA_INCLUDE,
    });
    if (!hoja) throw new NotFoundException('Hoja de produccion no encontrada');
    if (rol === 'PANADERO' && hoja.panaderoId !== usuarioId)
      throw new ForbiddenException('Solo puedes consultar tu propia hoja de produccion');
    return this.presentar(hoja);
  }

  async agregar(usuarioId: number, rol: string, dto: RegistrarEntradaHojaDto) {
    if (rol !== 'PANADERO')
      throw new ForbiddenException('Solo el panadero puede registrar su produccion');
    if (!Number.isInteger(dto.cantidad) || dto.cantidad <= 0)
      throw new BadRequestException('La cantidad debe ser un entero positivo');
    const repetida = await this.prisma.entradaHojaProduccion.findUnique({
      where: { claveOperacion: dto.claveOperacion },
      include: { hoja: true },
    });
    if (repetida) return this.respuestaReintento(repetida, usuarioId, rol, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fecha = fechaColombia();
        const creada = await tx.hojaProduccionPanaderia.upsert({
          where: { fecha_panaderoId: { fecha, panaderoId: usuarioId } },
          create: { fecha, panaderoId: usuarioId },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM "HojaProduccionPanaderia" WHERE id = ${creada.id} FOR UPDATE`;
        const hoja = await tx.hojaProduccionPanaderia.findUniqueOrThrow({ where: { id: creada.id } });
        const enHoja = await tx.entradaHojaProduccion.findUnique({
          where: { claveOperacion: dto.claveOperacion },
        });
        if (enHoja) {
          if (enHoja.hojaId !== hoja.id || enHoja.articuloId !== dto.articuloId || !enHoja.cantidad.equals(dto.cantidad))
            throw new ConflictException('La clave de operacion ya se uso para otra hornada');
          const actual = await tx.hojaProduccionPanaderia.findUniqueOrThrow({ where: { id: hoja.id }, include: HOJA_INCLUDE });
          return this.presentar(actual);
        }
        if (hoja.estado !== 'BORRADOR')
          throw new ConflictException('La hoja ya fue finalizada y no admite nuevas hornadas');
        const concepto = `Hoja #${hoja.id} · hornada ${dto.claveOperacion}`;
        const { articulo, movimiento } = await this.bakery.registrarProduccionEnTransaccion(
          tx, dto.articuloId, usuarioId, dto.cantidad, concepto,
        );
        await tx.entradaHojaProduccion.create({
          data: {
            hojaId: hoja.id,
            articuloId: articulo.id,
            movimientoId: movimiento.id,
            claveOperacion: dto.claveOperacion,
            nombreArticuloSnapshot: articulo.nombre,
            tipoSnapshot: articulo.tipo,
            cantidad: dto.cantidad,
            precioUnitarioSnapshot: articulo.precioVenta,
            subtotal: articulo.precioVenta.times(dto.cantidad),
          },
        });
        const actual = await tx.hojaProduccionPanaderia.findUniqueOrThrow({ where: { id: hoja.id }, include: HOJA_INCLUDE });
        return this.presentar(actual);
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const ahora = await this.prisma.entradaHojaProduccion.findUnique({
          where: { claveOperacion: dto.claveOperacion }, include: { hoja: true },
        });
        if (ahora) return this.respuestaReintento(ahora, usuarioId, rol, dto);
      }
      throw error;
    }
  }

  private respuestaReintento(
    entrada: { hoja: { id: number; panaderoId: number }; articuloId: number; cantidad: Prisma.Decimal },
    usuarioId: number,
    rol: string,
    dto: RegistrarEntradaHojaDto,
  ) {
    if (entrada.hoja.panaderoId !== usuarioId || entrada.articuloId !== dto.articuloId || !entrada.cantidad.equals(dto.cantidad))
      throw new ConflictException('La clave de operacion ya se uso para otra hornada');
    return this.obtener(entrada.hoja.id, usuarioId, rol);
  }

  async finalizar(id: number, usuarioId: number, rol: string) {
    if (rol !== 'PANADERO')
      throw new ForbiddenException('Solo el panadero puede finalizar su hoja');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "HojaProduccionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const hoja = await tx.hojaProduccionPanaderia.findUnique({ where: { id } });
      if (!hoja) throw new NotFoundException('Hoja de produccion no encontrada');
      if (hoja.panaderoId !== usuarioId)
        throw new ForbiddenException('Solo puedes finalizar tu propia hoja');
      if (hoja.estado === 'BORRADOR') {
        const cantidad = await tx.entradaHojaProduccion.count({ where: { hojaId: id } });
        if (cantidad === 0)
          throw new ConflictException('Registra al menos una hornada antes de finalizar la hoja');
        await tx.hojaProduccionPanaderia.update({
          where: { id }, data: { estado: 'FINALIZADA', fechaFinalizacion: new Date() },
        });
      }
      const completa = await tx.hojaProduccionPanaderia.findUniqueOrThrow({ where: { id }, include: HOJA_INCLUDE });
      return this.presentar(completa);
    });
  }
}

@Injectable()
export class ProductionGoalsBakeryService {
  constructor(private readonly prisma: PrismaService) {}

  listar(fecha?: string) {
    return this.prisma.metaProduccionPanaderia.findMany({
      where: { fecha: fecha ? parsearFecha(fecha) : fechaColombia() },
      include: META_INCLUDE,
      orderBy: [{ estado: 'asc' }, { tipoSnapshot: 'asc' }, { nombreSnapshot: 'asc' }],
    });
  }

  async crear(dto: CrearMetaPanaderiaDto, usuarioId: number) {
    const fecha = parsearFecha(dto.fecha);
    if (!Number.isInteger(dto.cantidadObjetivo) || dto.cantidadObjetivo <= 0)
      throw new BadRequestException('La cantidad objetivo debe ser un entero positivo');
    const articulo = await this.prisma.articuloPanaderia.findUnique({
      where: { id: dto.articuloId }, include: { categoria: true },
    });
    if (!articulo || !articulo.activo || !esProductoProducido(articulo.tipo))
      throw new NotFoundException('Selecciona un pan o postre activo del catalogo');
    if (!articulo.categoria || !articulo.categoria.activa || articulo.categoria.tipo !== articulo.tipo)
      throw new ConflictException('El producto necesita una categoria activa de panes o postres');
    try {
      return await this.prisma.metaProduccionPanaderia.create({
        data: {
          fecha,
          articuloId: articulo.id,
          nombreSnapshot: articulo.nombre,
          tipoSnapshot: articulo.tipo,
          cantidadObjetivo: dto.cantidadObjetivo,
          usuarioCreaId: usuarioId,
        },
        include: META_INCLUDE,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Ya existe una meta para ese producto en la fecha seleccionada');
      throw error;
    }
  }

  async actualizarEstado(id: number, estado: EstadoMetaProduccion, usuarioId: number, esAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "MetaProduccionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.metaProduccionPanaderia.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Meta de produccion no encontrada');
      if (esAdmin && estado !== 'PENDIENTE')
        throw new ForbiddenException('El panadero confirma si la meta se produjo o no');
      if (!esAdmin && estado === 'PENDIENTE')
        throw new ForbiddenException('Solo un administrador puede reabrir una meta');
      if (actual.estado === estado)
        return tx.metaProduccionPanaderia.findUniqueOrThrow({ where: { id }, include: META_INCLUDE });
      if (actual.estado !== 'PENDIENTE' && !esAdmin)
        throw new ForbiddenException('Solo un administrador puede corregir una meta resuelta');
      return tx.metaProduccionPanaderia.update({
        where: { id },
        data: estado === 'PENDIENTE'
          ? { estado, usuarioResuelveId: null, fechaResolucion: null }
          : { estado, usuarioResuelveId: usuarioId, fechaResolucion: new Date() },
        include: META_INCLUDE,
      });
    });
  }

  async eliminar(id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "MetaProduccionPanaderia" WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.metaProduccionPanaderia.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Meta de produccion no encontrada');
      if (actual.estado !== 'PENDIENTE')
        throw new ConflictException('Reabre la meta antes de eliminarla para conservar su historial');
      return tx.metaProduccionPanaderia.delete({ where: { id } });
    });
  }
}
