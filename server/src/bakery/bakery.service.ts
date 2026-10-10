import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fechaColombia, rangoDia } from '../recipes/inventory-reconciliation';
import {
  crearValoracion,
  presentarValoracion,
} from '../recipes/inventory-valuation';
import {
  accessContext,
  esAdministrador,
  esGlobal,
} from '../auth/access-context';
import { exigirDisponible } from './stock-compartido';
import {
  CrearArticuloPanaderiaDto,
  CrearRecetaPanaderiaDto,
  ActualizarArticuloPanaderiaDto,
  CrearVentaPanaderiaDto,
  EntradaPanaderiaDto,
  RegistrarConteoPanaderiaDto,
} from './dto';

const cero = new Prisma.Decimal(0);
type Cliente = Prisma.TransactionClient | PrismaService;
const esProducido = (tipo: string) =>
  tipo === 'PANADERIA' || tipo === 'PASTELERIA';

export function resumenConteo(conteo: {
  cantidadInicial: Prisma.Decimal;
  entradas: Prisma.Decimal;
  ventasRegistradas: Prisma.Decimal;
  transferencias: Prisma.Decimal;
  mermas: Prisma.Decimal;
  salidasJustificadas?: Prisma.Decimal;
  consumoReceta?: Prisma.Decimal;
  cantidadFisica: Prisma.Decimal;
  precioReferencia: Prisma.Decimal;
}) {
  const salidaFisica = conteo.cantidadInicial
    .plus(conteo.entradas)
    .minus(conteo.cantidadFisica);
  const ventaFisicaEstimada = salidaFisica
    .minus(conteo.transferencias)
    .minus(conteo.mermas)
    .minus(conteo.salidasJustificadas ?? 0)
    .minus(conteo.consumoReceta ?? 0);
  const diferenciaUnidades = ventaFisicaEstimada.minus(
    conteo.ventasRegistradas,
  );
  return {
    salidaFisica: salidaFisica.toString(),
    ventaFisicaEstimada: ventaFisicaEstimada.toString(),
    diferenciaUnidades: diferenciaUnidades.toString(),
    valorDiferencia: diferenciaUnidades
      .times(conteo.precioReferencia)
      .toString(),
  };
}

@Injectable()
export class BakeryService {
  constructor(private readonly prisma: PrismaService) {}

  async listarArticulos() {
    const articulos = await this.prisma.articuloPanaderia.findMany({
      include: {
        categoria: true,
        _count: { select: { productosCompartidos: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    const reservas = await this.prisma.reservaPanaderia.groupBy({
      by: ['articuloId'],
      where: { estado: 'RESERVADA' },
      _sum: { cantidad: true },
    });
    const porId = new Map(
      reservas.map((r) => [r.articuloId, r._sum.cantidad ?? cero]),
    );
    return articulos.map((a) => ({
      ...a,
      compartido: a._count.productosCompartidos > 0,
      reservado: porId.get(a.id) ?? cero,
      disponible: a.existencia.minus(porId.get(a.id) ?? 0),
    }));
  }

  listarElementosConteo() {
    return this.prisma.elementoConteoPanaderia.findMany({
      where: { activo: true, articulo: { activo: true } },
      include: { articulo: true },
      orderBy: { articulo: { nombre: 'asc' } },
    });
  }

  async agregarElementoConteo(articuloId: number) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, articuloId);
      if (!articulo.activo)
        throw new ConflictException(
          'Activa el articulo antes de agregarlo al conteo',
        );
      const existente = await tx.elementoConteoPanaderia.findFirst({
        where: { articuloId, activo: true },
      });
      if (existente)
        throw new ConflictException(
          'Este articulo ya pertenece a la lista fija',
        );
      return tx.elementoConteoPanaderia.create({
        data: { articuloId, fechaInicio: fechaColombia() },
        include: { articulo: true },
      });
    });
  }

  async retirarElementoConteo(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const elemento = await tx.elementoConteoPanaderia.findUnique({
        where: { id },
      });
      if (!elemento)
        throw new NotFoundException('Elemento de conteo no encontrado');
      await this.bloquearArticulo(tx, elemento.articuloId);
      const vigente = await tx.elementoConteoPanaderia.findUnique({
        where: { id },
      });
      if (!vigente?.activo)
        throw new ConflictException(
          'El articulo ya fue retirado de la lista fija',
        );
      return tx.elementoConteoPanaderia.update({
        where: { id },
        data: { activo: false, fechaFin: fechaColombia() },
      });
    });
  }

  async listarMovimientosArticulo(id: number, limite = 20) {
    const articulo = await this.prisma.articuloPanaderia.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!articulo)
      throw new NotFoundException('Articulo de panaderia no encontrado');
    return this.prisma.movimientoPanaderia.findMany({
      where: { articuloId: id },
      select: {
        id: true,
        tipo: true,
        cantidad: true,
        concepto: true,
        fecha: true,
        existenciaAntes: true,
        existenciaDespues: true,
        usuario: { select: { id_usuario: true, email_usuario: true } },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: limite,
    });
  }

  listarRecetas() {
    return this.prisma.recetaPanaderia.findMany({
      where: { activa: true },
      include: { articulo: true, detalles: { include: { insumo: true } } },
      orderBy: { id: 'desc' },
    });
  }

  async crearReceta(dto: CrearRecetaPanaderiaDto) {
    if (
      new Set(dto.detalles.map((detalle) => detalle.insumoId)).size !==
      dto.detalles.length
    )
      throw new UnprocessableEntityException(
        'Cada insumo debe aparecer una sola vez en la receta',
      );
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, dto.articuloId);
      if (!esProducido(articulo.tipo) || !articulo.activo)
        throw new UnprocessableEntityException(
          'La receta debe pertenecer a un articulo activo de panaderia',
        );
      const insumos = await tx.articuloPanaderia.findMany({
        where: { id: { in: dto.detalles.map((detalle) => detalle.insumoId) } },
      });
      if (
        insumos.length !== dto.detalles.length ||
        insumos.some((insumo) => insumo.tipo !== 'INSUMO' || !insumo.activo)
      )
        throw new UnprocessableEntityException(
          'La receta solo puede usar insumos activos de panaderia',
        );
      for (const detalle of dto.detalles) {
        const insumo = insumos.find((item) => item.id === detalle.insumoId)!;
        if (
          insumo.unidad === 'UNIDADES' &&
          !Number.isInteger(detalle.cantidadUnidad)
        )
          throw new UnprocessableEntityException(
            `${insumo.nombre} se mide en unidades enteras`,
          );
      }
      await tx.recetaPanaderia.updateMany({
        where: { articuloId: dto.articuloId, activa: true },
        data: { activa: false },
      });
      return tx.recetaPanaderia.create({
        data: {
          articuloId: dto.articuloId,
          nombre: dto.nombre.trim(),
          detalles: {
            create: dto.detalles.map((detalle) => ({
              insumoId: detalle.insumoId,
              cantidadUnidad: detalle.cantidadUnidad,
            })),
          },
        },
        include: { articulo: true, detalles: { include: { insumo: true } } },
      });
    });
  }

  async desactivarReceta(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const receta = await tx.recetaPanaderia.findUnique({ where: { id } });
      if (!receta)
        throw new NotFoundException('Receta de panaderia no encontrada');
      await this.bloquearArticulo(tx, receta.articuloId);
      return tx.recetaPanaderia.update({
        where: { id },
        data: { activa: false },
      });
    });
  }

  async crearArticulo(dto: CrearArticuloPanaderiaDto) {
    if (dto.tipo !== 'INSUMO' && dto.unidad && dto.unidad !== 'UNIDADES')
      throw new UnprocessableEntityException(
        'Los articulos de mostrador se venden por unidades',
      );
    if (dto.tipo !== 'INSUMO' && dto.costoReferencia != null)
      throw new UnprocessableEntityException(
        'El costo de referencia corresponde solo a insumos',
      );
    if (dto.categoriaId !== undefined)
      await this.validarCategoria(this.prisma, dto.tipo, dto.categoriaId);
    try {
      return await this.prisma.articuloPanaderia.create({
        data: {
          nombre: dto.nombre.trim(),
          tipo: dto.tipo,
          categoriaId: dto.categoriaId,
          unidad: dto.unidad ?? 'UNIDADES',
          precioVenta: dto.precioVenta,
          costoReferencia: dto.costoReferencia,
        },
        include: { categoria: true },
      });
    } catch (error) {
      return this.traducirCategoriaEliminada(error);
    }
  }

  async actualizarArticulo(id: number, dto: ActualizarArticuloPanaderiaDto) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (articulo.tipo !== 'INSUMO' && dto.costoReferencia != null)
        throw new UnprocessableEntityException(
          'El costo de referencia corresponde solo a insumos',
        );
      if (dto.categoriaId !== undefined)
        await this.validarCategoria(tx, articulo.tipo, dto.categoriaId);
      if (dto.activo === false && articulo.existencia.greaterThan(0))
        throw new ConflictException(
          'Cuenta o traslada las existencias antes de desactivar el articulo',
        );
      try {
        return await tx.articuloPanaderia.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
            ...(dto.precioVenta !== undefined && {
              precioVenta: dto.precioVenta,
            }),
            ...(dto.costoReferencia !== undefined && {
              costoReferencia: dto.costoReferencia,
            }),
            ...(dto.categoriaId !== undefined && {
              categoriaId: dto.categoriaId,
            }),
            ...(dto.activo !== undefined && { activo: dto.activo }),
          },
          include: { categoria: true },
        });
      } catch (error) {
        return this.traducirCategoriaEliminada(error);
      }
    });
  }

  private traducirCategoriaEliminada(error: unknown): never {
    if ((error as { code?: string }).code === 'P2003')
      throw new ConflictException('La categoría ya no existe; selecciona otra');
    throw error;
  }

  private async validarCategoria(
    cliente: Cliente,
    tipo: string,
    categoriaId: number | null,
  ) {
    if (categoriaId === null) return;
    if (tipo === 'INSUMO')
      throw new UnprocessableEntityException(
        'Los insumos no pertenecen al catalogo de productos',
      );
    const categoria = await cliente.categoriaPanaderia.findUnique({
      where: { id: categoriaId },
    });
    if (!categoria?.activa)
      throw new UnprocessableEntityException('Selecciona una categoria activa');
  }

  async registrarEntrada(
    id: number,
    usuarioId: number,
    dto: EntradaPanaderiaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo)
        throw new ConflictException('El articulo esta desactivado');
      this.exigirEntradaPermitida(articulo.tipo);
      if (esProducido(articulo.tipo))
        throw new ConflictException(
          'Registra las hornadas de panes y postres en Produccion, dentro de tu hoja diaria',
        );
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException(
          'Este articulo se cuenta en unidades enteras',
        );
      return this.mover(
        tx,
        articulo,
        dto.cantidad,
        usuarioId,
        'RECEPCION',
        dto.concepto.trim(),
      );
    });
  }

  async registrarHornadaCaja(
    id: number,
    usuarioId: number,
    dto: EntradaPanaderiaDto,
  ) {
    const actor = accessContext.getStore()?.user;
    if (actor && !['CAJERO', 'ADMIN_LOCAL'].includes(actor.rolNombre))
      throw new ForbiddenException(
        'Solo caja o administrador local registra esta recepción',
      );
    if (!dto.concepto.trim())
      throw new UnprocessableEntityException('Describe la hornada recibida');
    return this.prisma.$transaction(
      async (tx) => {
        const compartido = await tx.producto.count({
          where: { articuloCompartidoId: id },
        });
        if (!compartido)
          throw new ConflictException(
            'Esta recepción de caja corresponde únicamente a panes compartidos con Restaurante',
          );
        return this.registrarProduccionEnTransaccion(
          tx,
          id,
          usuarioId,
          dto.cantidad,
          dto.concepto.trim(),
        );
      },
      { timeout: 20000 },
    );
  }

  // Se invoca desde la hoja o la recepción de caja dentro de una transacción.
  // crea su linea. No abrir aqui otra transaccion: ante cualquier fallo debe
  // revertirse tanto la hornada como todos los consumos de la receta.
  async registrarProduccionEnTransaccion(
    tx: Prisma.TransactionClient,
    articuloId: number,
    usuarioId: number,
    cantidad: number,
    concepto: string,
  ) {
    const articulo = await this.bloquearArticulo(tx, articuloId);
    if (!articulo.activo || !esProducido(articulo.tipo))
      throw new ConflictException(
        'Selecciona un pan o postre activo del catalogo',
      );
    if (!articulo.categoriaId)
      throw new ConflictException(
        'Asigna una categoria al producto antes de producirlo',
      );
    const categoria = await tx.categoriaPanaderia.findUnique({
      where: { id: articulo.categoriaId },
    });
    if (!categoria?.activa)
      throw new ConflictException(
        'La categoria del producto debe estar activa',
      );
    if (!Number.isInteger(cantidad) || cantidad <= 0)
      throw new UnprocessableEntityException(
        'La hornada se registra en unidades enteras positivas',
      );
    const receta = await tx.recetaPanaderia.findFirst({
      where: { articuloId, activa: true },
      include: { detalles: true },
    });
    if (!receta || receta.detalles.length === 0)
      throw new ConflictException(
        'Crea una receta activa antes de registrar una hornada',
      );
    const insumos = new Map<number, typeof articulo>();
    for (const insumoId of receta.detalles
      .map((detalle) => detalle.insumoId)
      .sort((a, b) => a - b))
      insumos.set(insumoId, await this.bloquearArticulo(tx, insumoId));
    for (const detalle of receta.detalles) {
      const insumo = insumos.get(detalle.insumoId)!;
      if (!insumo.activo || insumo.tipo !== 'INSUMO')
        throw new ConflictException(
          `${insumo.nombre} ya no es un insumo activo`,
        );
      const consumo = detalle.cantidadUnidad.times(cantidad);
      if (insumo.unidad === 'UNIDADES' && !consumo.isInteger())
        throw new UnprocessableEntityException(
          `${insumo.nombre} requiere unidades enteras para esta hornada`,
        );
      await this.mover(
        tx,
        insumo,
        consumo.negated(),
        usuarioId,
        'CONSUMO_RECETA',
        `Receta #${receta.id} · ${concepto}`.slice(0, 200),
        { recetaId: receta.id },
      );
    }
    const movimiento = await this.mover(
      tx,
      articulo,
      cantidad,
      usuarioId,
      'PRODUCCION',
      concepto.slice(0, 200),
      { recetaId: receta.id },
    );
    return { articulo, movimiento };
  }

  async registrarMerma(
    id: number,
    usuarioId: number,
    dto: EntradaPanaderiaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      this.exigirEntradaPermitida(articulo.tipo);
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException(
          'Este articulo se cuenta en unidades enteras',
        );
      return this.mover(
        tx,
        articulo,
        -dto.cantidad,
        usuarioId,
        'MERMA',
        dto.concepto.trim(),
      );
    });
  }

  async registrarSalidaManual(
    id: number,
    usuarioId: number,
    dto: EntradaPanaderiaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo)
        throw new ConflictException('El articulo esta desactivado');
      this.exigirEntradaPermitida(articulo.tipo);
      if (!Number.isFinite(dto.cantidad) || dto.cantidad <= 0)
        throw new UnprocessableEntityException('La cantidad debe ser positiva');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException(
          'Este articulo se cuenta en unidades enteras',
        );
      const concepto = dto.concepto.trim();
      if (!concepto)
        throw new UnprocessableEntityException('Indica la razon de la salida');
      return this.mover(
        tx,
        articulo,
        -dto.cantidad,
        usuarioId,
        'SALIDA_MANUAL',
        concepto,
      );
    });
  }

  private exigirEntradaPermitida(tipo: string) {
    const actor = accessContext.getStore()?.user;
    if (!actor) return;
    if (esGlobal(actor.rolNombre))
      throw new ForbiddenException(
        'El administrador global solo puede consultar el inventario',
      );
    if (esAdministrador(actor.rolNombre)) return;
    const permitido =
      actor.rolNombre === 'PANADERO'
        ? tipo !== 'EXTERNO'
        : actor.rolNombre === 'CAJERO' && tipo === 'EXTERNO';
    if (!permitido)
      throw new ForbiddenException(
        'El panadero recibe insumos y registra producción; el cajero recibe productos externos',
      );
  }

  async crearVenta(usuarioId: number, dto: CrearVentaPanaderiaDto) {
    if (
      new Set(dto.lineas.map((linea) => linea.articuloId)).size !==
      dto.lineas.length
    )
      throw new UnprocessableEntityException(
        'Agrupa cada articulo en una sola linea',
      );
    const existente = await this.prisma.ventaPanaderia.findUnique({
      where: { claveOperacion: dto.claveOperacion },
      include: { detalles: true, pagos: true },
    });
    if (existente) return existente;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const turno = await tx.turno.findFirst({
          where: {
            id_usuario_turno: usuarioId,
            estado_turno: 'ABIERTO',
            caja: { area: 'PANADERIA' },
          },
        });
        if (!turno)
          throw new ConflictException(
            'Abre un turno de panaderia antes de vender',
          );
        await tx.$queryRaw`SELECT "id_turno" FROM "Turno" WHERE "id_turno" = ${turno.id_turno} FOR UPDATE`;
        const sigueAbierto = await tx.turno.findUniqueOrThrow({
          where: { id_turno: turno.id_turno },
        });
        if (sigueAbierto.estado_turno !== 'ABIERTO')
          throw new ConflictException('El turno fue cerrado durante la venta');

        // Orden estable de bloqueos: dos ventas con articulos compartidos no
        // entran en interbloqueo. El movimiento guarda precio y existencias.
        const articulos = new Map<
          number,
          Awaited<ReturnType<typeof this.bloquearArticulo>>
        >();
        for (const id of dto.lineas
          .map((linea) => linea.articuloId)
          .sort((a, b) => a - b)) {
          const articulo = await this.bloquearArticulo(tx, id);
          if (!articulo.activo)
            throw new ConflictException(`${articulo.nombre} esta desactivado`);
          if (articulo.tipo === 'INSUMO')
            throw new ConflictException(
              `${articulo.nombre} no se vende en mostrador`,
            );
          articulos.set(id, articulo);
        }
        const lineas = dto.lineas.map((linea) => {
          const articulo = articulos.get(linea.articuloId)!;
          if (articulo.existencia.lessThan(linea.cantidad))
            throw new ConflictException(
              `Existencia insuficiente de ${articulo.nombre}`,
            );
          return {
            articuloId: articulo.id,
            cantidad: linea.cantidad,
            nombreSnapshot: articulo.nombre,
            precioUnitario: articulo.precioVenta,
            subtotal: articulo.precioVenta.times(linea.cantidad),
          };
        });
        const total = lineas.reduce(
          (suma, linea) => suma.plus(linea.subtotal),
          cero,
        );
        const pagado = dto.pagos.reduce(
          (suma, pago) => suma.plus(pago.monto),
          cero,
        );
        if (!total.equals(pagado))
          throw new UnprocessableEntityException(
            `Los pagos deben sumar exactamente ${total.toString()} COP`,
          );

        const venta = await tx.ventaPanaderia.create({
          data: {
            claveOperacion: dto.claveOperacion,
            turnoId: turno.id_turno,
            total,
            concepto: dto.concepto?.trim(),
            detalles: { create: lineas },
            pagos: { create: dto.pagos },
          },
        });
        for (const linea of lineas) {
          await this.mover(
            tx,
            articulos.get(linea.articuloId)!,
            -linea.cantidad,
            usuarioId,
            'VENTA',
            `Venta #${venta.id}`,
            { ventaId: venta.id },
          );
        }
        const efectivo = dto.pagos
          .filter((pago) => pago.metodo === 'EFECTIVO')
          .reduce((suma, pago) => suma.plus(pago.monto), cero);
        if (efectivo.greaterThan(0)) {
          await tx.turno.update({
            where: { id_turno: turno.id_turno },
            data: { monto_cierre_esperado: { increment: efectivo } },
          });
        }
        return tx.ventaPanaderia.findUniqueOrThrow({
          where: { id: venta.id },
          include: { detalles: true, pagos: true },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const repetida = await this.prisma.ventaPanaderia.findUnique({
          where: { claveOperacion: dto.claveOperacion },
          include: { detalles: true, pagos: true },
        });
        if (repetida) return repetida;
      }
      throw error;
    }
  }

  listarVentas(turnoId?: number, fecha?: string) {
    const rango = fecha ? rangoDia(new Date(`${fecha}T00:00:00Z`)) : null;
    return this.prisma.ventaPanaderia.findMany({
      where: {
        ...(turnoId && { turnoId }),
        ...(rango && { fecha: { gte: rango.inicio, lt: rango.fin } }),
        turno: { caja: { area: 'PANADERIA' } },
      },
      include: {
        detalles: true,
        pagos: true,
        turno: {
          select: {
            id_turno: true,
            fecha_apertura_turno: true,
            fecha_cierre_turno: true,
            caja: { select: { nombre_caja: true } },
            usuario: {
              select: {
                email_usuario: true,
                empleado: {
                  select: { nombre_empleado: true, apellido_empleado: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      // El mostrador solo necesita recientes; Cuentas consulta todo el día.
      ...(!fecha && { take: 100 }),
    });
  }

  async registrarConteo(
    id: number,
    usuarioId: number,
    dto: RegistrarConteoPanaderiaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo)
        throw new ConflictException('El articulo esta desactivado');
      const fecha = fechaColombia();
      const enLista = await tx.elementoConteoPanaderia.findFirst({
        where: { articuloId: id, activo: true, fechaInicio: { lte: fecha } },
      });
      if (!enLista && articulo.tipo === 'INSUMO')
        throw new ConflictException(
          'Agrega el articulo a la lista fija antes de contarlo',
        );
      if (
        articulo.unidad === 'UNIDADES' &&
        !Number.isInteger(dto.cantidadFisica)
      )
        throw new UnprocessableEntityException(
          'Este articulo se cuenta en unidades enteras',
        );
      const { inicio, fin } = rangoDia(fecha);
      const previo = await tx.conteoPanaderia.findUnique({
        where: { fecha_articuloId: { fecha, articuloId: id } },
      });
      const movimientos = await tx.movimientoPanaderia.findMany({
        where: { articuloId: id, fecha: { gte: inicio, lt: fin } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      });
      const suma = (...tipos: string[]) =>
        movimientos
          .filter((movimiento) => tipos.includes(movimiento.tipo))
          .reduce((total, movimiento) => total.plus(movimiento.cantidad), cero);
      const saldosPrevios = previo
        ? new Map<number, Prisma.Decimal>()
        : await this.saldosDesdeConteoPrevio(tx, [id], fecha);
      const cantidadInicial =
        previo?.cantidadInicial ??
        saldosPrevios.get(id) ??
        movimientos[0]?.existenciaAntes ??
        articulo.existencia;
      const datos = {
        usuarioId,
        cantidadInicial,
        entradas: suma('PRODUCCION', 'RECEPCION'),
        ventasRegistradas: suma('VENTA'),
        transferencias: suma('TRANSFERENCIA'),
        mermas: suma('MERMA'),
        salidasJustificadas: suma('SALIDA_MANUAL'),
        consumoReceta: suma('CONSUMO_RECETA'),
        cantidadFisica: new Prisma.Decimal(dto.cantidadFisica),
        precioReferencia: articulo.precioVenta,
        fechaRegistro: new Date(),
      };
      const esInsumo = articulo.tipo === 'INSUMO';
      const valoracion = crearValoracion({
        tipoReferencia: esInsumo ? 'COSTO_UNITARIO' : 'PRECIO_VENTA',
        precioReferencia: esInsumo
          ? articulo.costoReferencia
          : articulo.precioVenta,
        nombre: articulo.nombre,
        unidad: articulo.unidad,
        salidaFisica: cantidadInicial
          .plus(datos.entradas)
          .minus(datos.cantidadFisica),
        cantidadCorroborada: esInsumo
          ? datos.consumoReceta
          : datos.ventasRegistradas,
        salidasNoValorables: datos.transferencias
          .plus(datos.mermas)
          .plus(datos.salidasJustificadas)
          .plus(esInsumo ? 0 : datos.consumoReceta),
        fechaValoracion: datos.fechaRegistro,
      });
      const conteo = await tx.conteoPanaderia.upsert({
        where: { fecha_articuloId: { fecha, articuloId: id } },
        create: {
          fecha,
          articuloId: id,
          ...datos,
          valoracion: valoracion as unknown as Prisma.InputJsonValue,
        },
        update: {
          ...datos,
          valoracion: valoracion as unknown as Prisma.InputJsonValue,
        },
        include: { articulo: true },
      });
      return {
        ...conteo,
        valoracion: presentarValoracion(conteo.valoracion),
        conciliacion: resumenConteo(conteo),
      };
    });
  }

  async estadoConteo(fecha = fechaColombia(), cliente: Cliente = this.prisma) {
    const hoy = fechaColombia();
    const esPasado = fecha.getTime() < hoy.getTime();
    const esFuturo = fecha.getTime() > hoy.getTime();
    const conteos = await cliente.conteoPanaderia.findMany({
      where: { fecha },
      include: { articulo: true },
    });
    const elementos = await cliente.elementoConteoPanaderia.findMany({
      where: {
        fechaInicio: { lte: fecha },
        OR: [{ fechaFin: null }, { fechaFin: { gt: fecha } }],
        ...(!esPasado && { activo: true, articulo: { activo: true } }),
      },
      include: { articulo: true },
      orderBy: { articulo: { nombre: 'asc' } },
    });
    const productosCierre = esPasado
      ? []
      : await cliente.articuloPanaderia.findMany({
          where: { activo: true, tipo: { not: 'INSUMO' } },
          orderBy: { nombre: 'asc' },
        });
    const articulos = esPasado
      ? conteos.map((conteo) => conteo.articulo)
      : [
          ...new Map(
            [...elementos.map((e) => e.articulo), ...productosCierre].map(
              (a) => [a.id, a],
            ),
          ).values(),
        ];
    const requeridos = esPasado ? elementos.map((e) => e.articulo) : articulos;
    const idsVigentes = new Set(requeridos.map((a) => a.id));
    const conteosVigentes = esPasado
      ? conteos
      : conteos.filter((conteo) => idsVigentes.has(conteo.articuloId));
    const conteoPorArticulo = new Map(
      conteos.map((conteo) => [conteo.articuloId, conteo]),
    );
    const saldosPrevios =
      esPasado || esFuturo
        ? new Map<number, Prisma.Decimal>()
        : await this.saldosDesdeConteoPrevio(
            cliente,
            articulos
              .filter((articulo) => !conteoPorArticulo.has(articulo.id))
              .map((articulo) => articulo.id),
            fecha,
          );
    const faltantes = requeridos
      .filter((a) => !conteoPorArticulo.has(a.id))
      .map((a) => a.nombre);
    const { inicio, fin } = rangoDia(fecha);
    const idsConMovimientos = esPasado
      ? conteos.map((conteo) => conteo.articuloId)
      : articulos.map((articulo) => articulo.id);
    const movimientos = esFuturo
      ? []
      : await cliente.movimientoPanaderia.findMany({
          where: {
            articuloId: { in: idsConMovimientos },
            fecha: { gte: inicio, lt: fin },
          },
          orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
        });
    const movimientosPorArticulo = new Map<number, typeof movimientos>();
    for (const movimiento of movimientos) {
      const lista = movimientosPorArticulo.get(movimiento.articuloId) ?? [];
      lista.push(movimiento);
      movimientosPorArticulo.set(movimiento.articuloId, lista);
    }
    const ultimaFecha = new Map<number, Date>();
    for (const movimiento of movimientos) {
      if (movimiento.tipo !== 'AJUSTE_CONTEO')
        ultimaFecha.set(movimiento.articuloId, movimiento.fecha);
    }
    const recontarIds = new Set(
      conteosVigentes
        .filter((conteo) => {
          const ultima = ultimaFecha.get(conteo.articuloId);
          return ultima && ultima > conteo.fechaRegistro;
        })
        .map((conteo) => conteo.articuloId),
    );
    const recontar = conteosVigentes
      .filter((conteo) => recontarIds.has(conteo.articuloId))
      .map((conteo) => conteo.articulo.nombre);
    // Una foto confirmada hoy permanece consultable aunque el administrador
    // retire luego el articulo; deja de ser obligatoria para el cierre.
    const detalle = conteos.map((conteo) => ({
      ...conteo,
      conciliacion: resumenConteo(conteo),
      requiereReconteo: recontarIds.has(conteo.articuloId),
      valoracion: presentarValoracion(
        conteo.valoracion,
        recontarIds.has(conteo.articuloId) ? 'RECONTAR' : undefined,
      ),
    }));
    const valorDiferencia = detalle.reduce(
      (total, conteo) => total.plus(conteo.conciliacion.valorDiferencia),
      cero,
    );
    // Para una fecha pasada solo se conocen con certeza los artículos que
    // realmente fueron contados; la lista activa de hoy no es su foto histórica.
    const proyeccion = esPasado
      ? conteos.map((conteo) => ({
          articuloId: conteo.articuloId,
          cantidadInicial: conteo.cantidadInicial,
          entradas: conteo.entradas,
          ventasRegistradas: conteo.ventasRegistradas,
          transferencias: conteo.transferencias,
          mermas: conteo.mermas,
          salidasJustificadas: conteo.salidasJustificadas,
          consumoReceta: conteo.consumoReceta,
        }))
      : articulos.map((articulo) => {
          const movimientosArticulo =
            movimientosPorArticulo.get(articulo.id) ?? [];
          const suma = (...tipos: string[]) =>
            movimientosArticulo
              .filter((movimiento) => tipos.includes(movimiento.tipo))
              .reduce(
                (total, movimiento) => total.plus(movimiento.cantidad),
                cero,
              );
          return {
            articuloId: articulo.id,
            cantidadInicial: esFuturo
              ? null
              : (conteoPorArticulo.get(articulo.id)?.cantidadInicial ??
                saldosPrevios.get(articulo.id) ??
                movimientosArticulo[0]?.existenciaAntes ??
                // Una lectura histórica no convierte el stock de hoy en un saldo
                // de aquella fecha. Sin conteo ni libro de movimientos es desconocido.
                (fecha.toISOString().slice(0, 10) ===
                fechaColombia().toISOString().slice(0, 10)
                  ? articulo.existencia
                  : null)),
            entradas: suma('PRODUCCION', 'RECEPCION'),
            ventasRegistradas: suma('VENTA'),
            transferencias: suma('TRANSFERENCIA'),
            mermas: suma('MERMA'),
            salidasJustificadas: suma('SALIDA_MANUAL'),
            consumoReceta: suma('CONSUMO_RECETA'),
          };
        });
    const totalArticulos = esPasado
      ? elementos.length || conteos.length
      : articulos.length;
    return {
      fecha: fecha.toISOString().slice(0, 10),
      totalArticulos,
      articulosConfigurados: requeridos.map((a) => a.id),
      articulosObligatorios: productosCierre,
      faltantes,
      recontar,
      // Antes de la lista fija pueden existir fotos de conteo incompletas.
      // Sin una configuracion aplicable a esa fecha no se puede certificar un cierre.
      completo:
        requeridos.length > 0 &&
        faltantes.length === 0 &&
        recontar.length === 0,
      valorDiferencia: valorDiferencia.toString(),
      proyeccion,
      detalle,
    };
  }

  private async saldosDesdeConteoPrevio(
    cliente: Cliente,
    ids: number[],
    fecha: Date,
  ) {
    const saldos = new Map<number, Prisma.Decimal>();
    if (ids.length === 0) return saldos;
    const { inicio } = rangoDia(fecha);
    // Una consulta por grupo: cada artículo parte de su último conteo físico,
    // aunque el ajuste a la existencia cacheada todavía no se haya aplicado.
    const anteriores = await cliente.conteoPanaderia.findMany({
      where: {
        articuloId: { in: ids },
        fecha: { lt: fecha },
        fechaRegistro: { lte: inicio },
      },
      distinct: ['articuloId'],
      orderBy: [
        { articuloId: 'asc' },
        { fecha: 'desc' },
        { fechaRegistro: 'desc' },
        { id: 'desc' },
      ],
      select: { articuloId: true, cantidadFisica: true, fechaRegistro: true },
    });
    if (anteriores.length === 0) return saldos;
    const anteriorPorArticulo = new Map(
      anteriores.map((conteo) => [conteo.articuloId, conteo]),
    );
    for (const anterior of anteriores)
      saldos.set(anterior.articuloId, anterior.cantidadFisica);
    const desde = new Date(
      Math.min(...anteriores.map((conteo) => conteo.fechaRegistro.getTime())),
    );
    const movimientos = await cliente.movimientoPanaderia.findMany({
      where: {
        articuloId: { in: anteriores.map((conteo) => conteo.articuloId) },
        fecha: { gt: desde, lt: inicio },
        tipo: { not: 'AJUSTE_CONTEO' },
      },
      select: {
        articuloId: true,
        tipo: true,
        existenciaAntes: true,
        existenciaDespues: true,
        fecha: true,
      },
    });
    for (const movimiento of movimientos) {
      const anterior = anteriorPorArticulo.get(movimiento.articuloId);
      if (
        !anterior ||
        movimiento.tipo === 'AJUSTE_CONTEO' ||
        movimiento.fecha <= anterior.fechaRegistro
      )
        continue;
      saldos.set(
        movimiento.articuloId,
        saldos
          .get(movimiento.articuloId)!
          .plus(movimiento.existenciaDespues.minus(movimiento.existenciaAntes)),
      );
    }
    return saldos;
  }

  async aplicarConteoCierre(
    tx: Prisma.TransactionClient,
    usuarioId: number,
    fecha: Date,
  ) {
    const estado = await this.estadoConteo(fecha, tx);
    if (!estado.completo) {
      throw new ConflictException(
        `Completa el conteo de panaderia del ${estado.fecha}. ` +
          `Pendientes: ${[...estado.faltantes, ...estado.recontar].join(', ') || 'configura articulos activos'}`,
      );
    }
    const configurados = new Set(estado.articulosConfigurados);
    for (const conteo of estado.detalle.filter((fila) =>
      configurados.has(fila.articuloId),
    )) {
      const articulo = await this.bloquearArticulo(tx, conteo.articuloId);
      await exigirDisponible(tx, articulo.id, conteo.cantidadFisica, 0);
      if (articulo.existencia.equals(conteo.cantidadFisica)) continue;
      await tx.articuloPanaderia.update({
        where: { id: articulo.id },
        data: { existencia: conteo.cantidadFisica },
      });
      await tx.movimientoPanaderia.create({
        data: {
          articuloId: articulo.id,
          usuarioId,
          tipo: 'AJUSTE_CONTEO',
          cantidad: articulo.existencia.minus(conteo.cantidadFisica).abs(),
          existenciaAntes: articulo.existencia,
          existenciaDespues: conteo.cantidadFisica,
          concepto: `Ajuste por conteo fisico del ${estado.fecha}`,
        },
      });
    }
    return estado;
  }

  private async bloquearArticulo(tx: Prisma.TransactionClient, id: number) {
    const filas = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "ArticuloPanaderia" WHERE id = ${id} FOR UPDATE
    `;
    if (!filas[0])
      throw new NotFoundException('Articulo de panaderia no encontrado');
    return tx.articuloPanaderia.findUniqueOrThrow({ where: { id } });
  }

  private async mover(
    tx: Prisma.TransactionClient,
    articulo: Awaited<ReturnType<BakeryService['bloquearArticulo']>>,
    delta: number | Prisma.Decimal,
    usuarioId: number,
    tipo:
      | 'PRODUCCION'
      | 'CONSUMO_RECETA'
      | 'RECEPCION'
      | 'VENTA'
      | 'TRANSFERENCIA'
      | 'MERMA'
      | 'SALIDA_MANUAL',
    concepto: string,
    referencias?: {
      ventaId?: number;
      recetaId?: number;
    },
  ) {
    const despues = articulo.existencia.plus(delta);
    if (new Prisma.Decimal(delta).lessThan(0))
      await exigirDisponible(
        tx,
        articulo.id,
        articulo.existencia,
        new Prisma.Decimal(delta).abs(),
      );
    if (despues.lessThan(0))
      throw new ConflictException(
        `Existencia insuficiente de ${articulo.nombre}`,
      );
    await tx.articuloPanaderia.update({
      where: { id: articulo.id },
      data: { existencia: despues },
    });
    return tx.movimientoPanaderia.create({
      data: {
        articuloId: articulo.id,
        usuarioId,
        tipo,
        cantidad: new Prisma.Decimal(delta).abs(),
        existenciaAntes: articulo.existencia,
        existenciaDespues: despues,
        concepto,
        ...referencias,
      },
    });
  }
}
