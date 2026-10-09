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
import { crearValoracion, presentarValoracion } from '../recipes/inventory-valuation';
import { accessContext, esAdministrador, esGlobal } from '../auth/access-context';
import {
  CrearArticuloPanaderiaDto,
  CrearRecetaPanaderiaDto,
  ActualizarArticuloPanaderiaDto,
  ConfirmarIngresoTransferenciaDto,
  CrearTransferenciaPanaderiaDto,
  CrearTransferenciaRestauranteDto,
  CrearVentaPanaderiaDto,
  EntradaPanaderiaDto,
  RegistrarConteoPanaderiaDto,
  PagarTransferenciaRestauranteDto,
} from './dto';

const cero = new Prisma.Decimal(0);
type Cliente = Prisma.TransactionClient | PrismaService;
const esProducido = (tipo: string) => tipo === 'PANADERIA' || tipo === 'PASTELERIA';

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
  listarInsumosDestino() {
    return this.prisma.articuloPanaderia.findMany({ where: { tipo: 'INSUMO', activo: true }, select: { id: true, nombre: true, unidad: true, activo: true, tipo: true }, orderBy: { nombre: 'asc' } });
  }

  listarRecepciones() {
    return this.prisma.transferenciaRestaurantePanaderia.findMany({ where: { fechaRecepcion: null }, select: { id: true, cantidad: true, concepto: true, fechaSalida: true, articuloDestino: { select: { nombre: true, unidad: true } } }, orderBy: { fechaSalida: 'asc' } });
  }
  constructor(private readonly prisma: PrismaService) {}

  listarArticulos() {
    return this.prisma.articuloPanaderia.findMany({
      include: { categoria: true }, orderBy: { nombre: 'asc' },
    });
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
        throw new ConflictException('Activa el articulo antes de agregarlo al conteo');
      const existente = await tx.elementoConteoPanaderia.findFirst({
        where: { articuloId, activo: true },
      });
      if (existente)
        throw new ConflictException('Este articulo ya pertenece a la lista fija');
      return tx.elementoConteoPanaderia.create({
        data: { articuloId, fechaInicio: fechaColombia() },
        include: { articulo: true },
      });
    });
  }

  async retirarElementoConteo(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const elemento = await tx.elementoConteoPanaderia.findUnique({ where: { id } });
      if (!elemento) throw new NotFoundException('Elemento de conteo no encontrado');
      await this.bloquearArticulo(tx, elemento.articuloId);
      const vigente = await tx.elementoConteoPanaderia.findUnique({ where: { id } });
      if (!vigente?.activo)
        throw new ConflictException('El articulo ya fue retirado de la lista fija');
      return tx.elementoConteoPanaderia.update({
        where: { id },
        data: { activo: false, fechaFin: fechaColombia() },
      });
    });
  }

  async listarMovimientosArticulo(id: number, limite = 20) {
    const articulo = await this.prisma.articuloPanaderia.findUnique({ where: { id }, select: { id: true } });
    if (!articulo) throw new NotFoundException('Articulo de panaderia no encontrado');
    return this.prisma.movimientoPanaderia.findMany({
      where: { articuloId: id },
      select: {
        id: true, tipo: true, cantidad: true, concepto: true, fecha: true,
        existenciaAntes: true, existenciaDespues: true,
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
    if (new Set(dto.detalles.map((detalle) => detalle.insumoId)).size !== dto.detalles.length)
      throw new UnprocessableEntityException('Cada insumo debe aparecer una sola vez en la receta');
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, dto.articuloId);
      if (!esProducido(articulo.tipo) || !articulo.activo)
        throw new UnprocessableEntityException('La receta debe pertenecer a un articulo activo de panaderia');
      const insumos = await tx.articuloPanaderia.findMany({
        where: { id: { in: dto.detalles.map((detalle) => detalle.insumoId) } },
      });
      if (insumos.length !== dto.detalles.length || insumos.some((insumo) => insumo.tipo !== 'INSUMO' || !insumo.activo))
        throw new UnprocessableEntityException('La receta solo puede usar insumos activos de panaderia');
      for (const detalle of dto.detalles) {
        const insumo = insumos.find((item) => item.id === detalle.insumoId)!;
        if (insumo.unidad === 'UNIDADES' && !Number.isInteger(detalle.cantidadUnidad))
          throw new UnprocessableEntityException(`${insumo.nombre} se mide en unidades enteras`);
      }
      await tx.recetaPanaderia.updateMany({ where: { articuloId: dto.articuloId, activa: true }, data: { activa: false } });
      return tx.recetaPanaderia.create({
        data: {
          articuloId: dto.articuloId,
          nombre: dto.nombre.trim(),
          detalles: { create: dto.detalles.map((detalle) => ({ insumoId: detalle.insumoId, cantidadUnidad: detalle.cantidadUnidad })) },
        },
        include: { articulo: true, detalles: { include: { insumo: true } } },
      });
    });
  }

  async desactivarReceta(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const receta = await tx.recetaPanaderia.findUnique({ where: { id } });
      if (!receta) throw new NotFoundException('Receta de panaderia no encontrada');
      await this.bloquearArticulo(tx, receta.articuloId);
      return tx.recetaPanaderia.update({ where: { id }, data: { activa: false } });
    });
  }

  async crearArticulo(dto: CrearArticuloPanaderiaDto) {
    if (dto.tipo !== 'INSUMO' && dto.unidad && dto.unidad !== 'UNIDADES')
      throw new UnprocessableEntityException('Los articulos de mostrador se venden por unidades');
    if (dto.tipo !== 'INSUMO' && dto.costoReferencia != null)
      throw new UnprocessableEntityException('El costo de referencia corresponde solo a insumos');
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
        throw new UnprocessableEntityException('El costo de referencia corresponde solo a insumos');
      if (dto.categoriaId !== undefined)
        await this.validarCategoria(tx, articulo.tipo, dto.categoriaId);
      if (dto.activo === false && articulo.existencia.greaterThan(0))
        throw new ConflictException('Cuenta o traslada las existencias antes de desactivar el articulo');
      try {
        return await tx.articuloPanaderia.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
            ...(dto.precioVenta !== undefined && { precioVenta: dto.precioVenta }),
            ...(dto.costoReferencia !== undefined && { costoReferencia: dto.costoReferencia }),
            ...(dto.categoriaId !== undefined && { categoriaId: dto.categoriaId }),
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

  private async validarCategoria(cliente: Cliente, tipo: string, categoriaId: number | null) {
    if (categoriaId === null) return;
    if (tipo === 'INSUMO')
      throw new UnprocessableEntityException('Los insumos no pertenecen al catalogo de productos');
    const categoria = await cliente.categoriaPanaderia.findUnique({ where: { id: categoriaId } });
    if (!categoria?.activa)
      throw new UnprocessableEntityException('Selecciona una categoria activa');
  }

  async registrarEntrada(id: number, usuarioId: number, dto: EntradaPanaderiaDto) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo) throw new ConflictException('El articulo esta desactivado');
      this.exigirEntradaPermitida(articulo.tipo);
      if (esProducido(articulo.tipo))
        throw new ConflictException('Registra las hornadas de panes y postres en Produccion, dentro de tu hoja diaria');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException('Este articulo se cuenta en unidades enteras');
      return this.mover(tx, articulo, dto.cantidad, usuarioId, 'RECEPCION', dto.concepto.trim());
    });
  }

  // Se invoca unicamente desde la hoja y dentro de la misma transaccion que
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
      throw new ConflictException('Selecciona un pan o postre activo del catalogo');
    if (!articulo.categoriaId)
      throw new ConflictException('Asigna una categoria al producto antes de producirlo');
    const categoria = await tx.categoriaPanaderia.findUnique({ where: { id: articulo.categoriaId } });
    if (!categoria?.activa)
      throw new ConflictException('La categoria del producto debe estar activa');
    if (!Number.isInteger(cantidad) || cantidad <= 0)
      throw new UnprocessableEntityException('La hornada se registra en unidades enteras positivas');
    const receta = await tx.recetaPanaderia.findFirst({
      where: { articuloId, activa: true }, include: { detalles: true },
    });
    if (!receta || receta.detalles.length === 0)
      throw new ConflictException('Crea una receta activa antes de registrar una hornada');
    const insumos = new Map<number, typeof articulo>();
    for (const insumoId of receta.detalles.map((detalle) => detalle.insumoId).sort((a, b) => a - b))
      insumos.set(insumoId, await this.bloquearArticulo(tx, insumoId));
    for (const detalle of receta.detalles) {
      const insumo = insumos.get(detalle.insumoId)!;
      if (!insumo.activo || insumo.tipo !== 'INSUMO')
        throw new ConflictException(`${insumo.nombre} ya no es un insumo activo`);
      const consumo = detalle.cantidadUnidad.times(cantidad);
      if (insumo.unidad === 'UNIDADES' && !consumo.isInteger())
        throw new UnprocessableEntityException(`${insumo.nombre} requiere unidades enteras para esta hornada`);
      await this.mover(tx, insumo, consumo.negated(), usuarioId, 'CONSUMO_RECETA',
        `Receta #${receta.id} · ${concepto}`.slice(0, 200), { recetaId: receta.id });
    }
    const movimiento = await this.mover(tx, articulo, cantidad, usuarioId,
      'PRODUCCION', concepto.slice(0, 200), { recetaId: receta.id });
    return { articulo, movimiento };
  }

  async registrarMerma(id: number, usuarioId: number, dto: EntradaPanaderiaDto) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      this.exigirEntradaPermitida(articulo.tipo);
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException('Este articulo se cuenta en unidades enteras');
      return this.mover(tx, articulo, -dto.cantidad, usuarioId, 'MERMA', dto.concepto.trim());
    });
  }

  async registrarSalidaManual(id: number, usuarioId: number, dto: EntradaPanaderiaDto) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo) throw new ConflictException('El articulo esta desactivado');
      this.exigirEntradaPermitida(articulo.tipo);
      if (!Number.isFinite(dto.cantidad) || dto.cantidad <= 0)
        throw new UnprocessableEntityException('La cantidad debe ser positiva');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException('Este articulo se cuenta en unidades enteras');
      const concepto = dto.concepto.trim();
      if (!concepto)
        throw new UnprocessableEntityException('Indica la razon de la salida');
      return this.mover(tx, articulo, -dto.cantidad, usuarioId, 'SALIDA_MANUAL', concepto);
    });
  }

  private exigirEntradaPermitida(tipo: string) {
    const actor = accessContext.getStore()?.user;
    if (!actor) return;
    if (esGlobal(actor.rolNombre))
      throw new ForbiddenException('El administrador global solo puede consultar el inventario');
    if (esAdministrador(actor.rolNombre)) return;
    const permitido = actor.rolNombre === 'PANADERO' ? tipo !== 'EXTERNO' : actor.rolNombre === 'CAJERO' && tipo === 'EXTERNO';
    if (!permitido) throw new ForbiddenException('El panadero recibe insumos y registra producción; el cajero recibe productos externos');
  }

  async crearVenta(usuarioId: number, dto: CrearVentaPanaderiaDto) {
    if (new Set(dto.lineas.map((linea) => linea.articuloId)).size !== dto.lineas.length)
      throw new UnprocessableEntityException('Agrupa cada articulo en una sola linea');
    const existente = await this.prisma.ventaPanaderia.findUnique({
      where: { claveOperacion: dto.claveOperacion },
      include: { detalles: true, pagos: true },
    });
    if (existente) return existente;
    try { return await this.prisma.$transaction(async (tx) => {
      const turno = await tx.turno.findFirst({
        where: {
          id_usuario_turno: usuarioId,
          estado_turno: 'ABIERTO',
          caja: { area: 'PANADERIA' },
        },
      });
      if (!turno)
        throw new ConflictException('Abre un turno de panaderia antes de vender');
      await tx.$queryRaw`SELECT "id_turno" FROM "Turno" WHERE "id_turno" = ${turno.id_turno} FOR UPDATE`;
      const sigueAbierto = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });
      if (sigueAbierto.estado_turno !== 'ABIERTO')
        throw new ConflictException('El turno fue cerrado durante la venta');

      // Orden estable de bloqueos: dos ventas con articulos compartidos no
      // entran en interbloqueo. El movimiento guarda precio y existencias.
      const articulos = new Map<number, Awaited<ReturnType<typeof this.bloquearArticulo>>>();
      for (const id of dto.lineas.map((linea) => linea.articuloId).sort((a, b) => a - b)) {
        const articulo = await this.bloquearArticulo(tx, id);
        if (!articulo.activo) throw new ConflictException(`${articulo.nombre} esta desactivado`);
        if (articulo.tipo === 'INSUMO') throw new ConflictException(`${articulo.nombre} no se vende en mostrador`);
        articulos.set(id, articulo);
      }
      const lineas = dto.lineas.map((linea) => {
        const articulo = articulos.get(linea.articuloId)!;
        if (articulo.existencia.lessThan(linea.cantidad))
          throw new ConflictException(`Existencia insuficiente de ${articulo.nombre}`);
        return {
          articuloId: articulo.id,
          cantidad: linea.cantidad,
          nombreSnapshot: articulo.nombre,
          precioUnitario: articulo.precioVenta,
          subtotal: articulo.precioVenta.times(linea.cantidad),
        };
      });
      const total = lineas.reduce((suma, linea) => suma.plus(linea.subtotal), cero);
      const pagado = dto.pagos.reduce((suma, pago) => suma.plus(pago.monto), cero);
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
        await this.mover(tx, articulos.get(linea.articuloId)!, -linea.cantidad,
          usuarioId, 'VENTA', `Venta #${venta.id}`, { ventaId: venta.id });
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
    }); } catch (error) {
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
      where: { ...(turnoId && { turnoId }), ...(rango && { fecha: { gte: rango.inicio, lt: rango.fin } }), turno: { caja: { area: 'PANADERIA' } } },
      include: { detalles: true, pagos: true, turno: { select: {
        id_turno: true, fecha_apertura_turno: true, fecha_cierre_turno: true,
        caja: { select: { nombre_caja: true } },
        usuario: { select: { email_usuario: true, empleado: { select: { nombre_empleado: true, apellido_empleado: true } } } },
      } } },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      // El mostrador solo necesita recientes; Cuentas consulta todo el día.
      ...(!fecha && { take: 100 }),
    });
  }

  async registrarConteo(id: number, usuarioId: number, dto: RegistrarConteoPanaderiaDto) {
    return this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, id);
      if (!articulo.activo) throw new ConflictException('El articulo esta desactivado');
      const fecha = fechaColombia();
      const enLista = await tx.elementoConteoPanaderia.findFirst({
        where: { articuloId: id, activo: true, fechaInicio: { lte: fecha } },
      });
      if (!enLista)
        throw new ConflictException('Agrega el articulo a la lista fija antes de contarlo');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidadFisica))
        throw new UnprocessableEntityException('Este articulo se cuenta en unidades enteras');
      const { inicio, fin } = rangoDia(fecha);
      const previo = await tx.conteoPanaderia.findUnique({
        where: { fecha_articuloId: { fecha, articuloId: id } },
      });
      const movimientos = await tx.movimientoPanaderia.findMany({
        where: { articuloId: id, fecha: { gte: inicio, lt: fin } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      });
      const suma = (...tipos: string[]) => movimientos
        .filter((movimiento) => tipos.includes(movimiento.tipo))
        .reduce((total, movimiento) => total.plus(movimiento.cantidad), cero);
      const saldosPrevios = previo ? new Map<number, Prisma.Decimal>()
        : await this.saldosDesdeConteoPrevio(tx, [id], fecha);
      const cantidadInicial = previo?.cantidadInicial
        ?? saldosPrevios.get(id)
        ?? movimientos[0]?.existenciaAntes
        ?? articulo.existencia;
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
        precioReferencia: esInsumo ? articulo.costoReferencia : articulo.precioVenta,
        nombre: articulo.nombre,
        unidad: articulo.unidad,
        salidaFisica: cantidadInicial.plus(datos.entradas).minus(datos.cantidadFisica),
        cantidadCorroborada: esInsumo ? datos.consumoReceta : datos.ventasRegistradas,
        salidasNoValorables: datos.transferencias.plus(datos.mermas).plus(datos.salidasJustificadas).plus(esInsumo ? 0 : datos.consumoReceta),
        fechaValoracion: datos.fechaRegistro,
      });
      const conteo = await tx.conteoPanaderia.upsert({
        where: { fecha_articuloId: { fecha, articuloId: id } },
        create: { fecha, articuloId: id, ...datos, valoracion: valoracion as unknown as Prisma.InputJsonValue },
        update: { ...datos, valoracion: valoracion as unknown as Prisma.InputJsonValue },
        include: { articulo: true },
      });
      return { ...conteo, valoracion: presentarValoracion(conteo.valoracion), conciliacion: resumenConteo(conteo) };
    });
  }

  async estadoConteo(fecha = fechaColombia(), cliente: Cliente = this.prisma) {
    const hoy = fechaColombia();
    const esPasado = fecha.getTime() < hoy.getTime();
    const esFuturo = fecha.getTime() > hoy.getTime();
    const conteos = await cliente.conteoPanaderia.findMany({
      where: { fecha }, include: { articulo: true },
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
    const articulos = esPasado
      ? conteos.map((conteo) => conteo.articulo)
      : elementos.map((elemento) => elemento.articulo);
    const idsVigentes = new Set(elementos.map((elemento) => elemento.articuloId));
    const conteosVigentes = esPasado
      ? conteos
      : conteos.filter((conteo) => idsVigentes.has(conteo.articuloId));
    const conteoPorArticulo = new Map(conteos.map((conteo) => [conteo.articuloId, conteo]));
    const saldosPrevios = esPasado || esFuturo
      ? new Map<number, Prisma.Decimal>()
      : await this.saldosDesdeConteoPrevio(
          cliente, articulos.filter((articulo) => !conteoPorArticulo.has(articulo.id)).map((articulo) => articulo.id), fecha,
        );
    const faltantes = elementos.filter((elemento) => !conteoPorArticulo.has(elemento.articuloId))
      .map((elemento) => elemento.articulo.nombre);
    const { inicio, fin } = rangoDia(fecha);
    const idsConMovimientos = esPasado
      ? conteos.map((conteo) => conteo.articuloId)
      : articulos.map((articulo) => articulo.id);
    const movimientos = esFuturo
      ? []
      : await cliente.movimientoPanaderia.findMany({
          where: { articuloId: { in: idsConMovimientos }, fecha: { gte: inicio, lt: fin } },
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
    const recontarIds = new Set(conteosVigentes.filter((conteo) => {
      const ultima = ultimaFecha.get(conteo.articuloId);
      return ultima && ultima > conteo.fechaRegistro;
    }).map((conteo) => conteo.articuloId));
    const recontar = conteosVigentes.filter((conteo) => recontarIds.has(conteo.articuloId))
      .map((conteo) => conteo.articulo.nombre);
    // Una foto confirmada hoy permanece consultable aunque el administrador
    // retire luego el articulo; deja de ser obligatoria para el cierre.
    const detalle = conteos.map((conteo) => ({
      ...conteo,
      conciliacion: resumenConteo(conteo),
      requiereReconteo: recontarIds.has(conteo.articuloId),
      valoracion: presentarValoracion(conteo.valoracion, recontarIds.has(conteo.articuloId) ? 'RECONTAR' : undefined),
    }));
    const valorDiferencia = detalle.reduce(
      (total, conteo) => total.plus(conteo.conciliacion.valorDiferencia), cero,
    );
    // Para una fecha pasada solo se conocen con certeza los artículos que
    // realmente fueron contados; la lista activa de hoy no es su foto histórica.
    const proyeccion = esPasado ? conteos.map((conteo) => ({
      articuloId: conteo.articuloId,
      cantidadInicial: conteo.cantidadInicial,
      entradas: conteo.entradas,
      ventasRegistradas: conteo.ventasRegistradas,
      transferencias: conteo.transferencias,
      mermas: conteo.mermas,
      salidasJustificadas: conteo.salidasJustificadas,
      consumoReceta: conteo.consumoReceta,
    })) : articulos.map((articulo) => {
      const movimientosArticulo = movimientosPorArticulo.get(articulo.id) ?? [];
      const suma = (...tipos: string[]) => movimientosArticulo
        .filter((movimiento) => tipos.includes(movimiento.tipo))
        .reduce((total, movimiento) => total.plus(movimiento.cantidad), cero);
      return {
        articuloId: articulo.id,
        cantidadInicial: esFuturo ? null : conteoPorArticulo.get(articulo.id)?.cantidadInicial
          ?? saldosPrevios.get(articulo.id)
          ?? movimientosArticulo[0]?.existenciaAntes
          // Una lectura histórica no convierte el stock de hoy en un saldo
          // de aquella fecha. Sin conteo ni libro de movimientos es desconocido.
          ?? (fecha.toISOString().slice(0, 10) === fechaColombia().toISOString().slice(0, 10)
            ? articulo.existencia : null),
        entradas: suma('PRODUCCION', 'RECEPCION'),
        ventasRegistradas: suma('VENTA'),
        transferencias: suma('TRANSFERENCIA'),
        mermas: suma('MERMA'),
        salidasJustificadas: suma('SALIDA_MANUAL'),
        consumoReceta: suma('CONSUMO_RECETA'),
      };
    });
    const totalArticulos = esPasado ? elementos.length || conteos.length : articulos.length;
    return {
      fecha: fecha.toISOString().slice(0, 10),
      totalArticulos,
      articulosConfigurados: elementos.map((elemento) => elemento.articuloId),
      faltantes,
      recontar,
      // Antes de la lista fija pueden existir fotos de conteo incompletas.
      // Sin una configuracion aplicable a esa fecha no se puede certificar un cierre.
      completo: elementos.length > 0 && faltantes.length === 0 && recontar.length === 0,
      valorDiferencia: valorDiferencia.toString(),
      proyeccion,
      detalle,
    };
  }

  private async saldosDesdeConteoPrevio(cliente: Cliente, ids: number[], fecha: Date) {
    const saldos = new Map<number, Prisma.Decimal>();
    if (ids.length === 0) return saldos;
    const { inicio } = rangoDia(fecha);
    // Una consulta por grupo: cada artículo parte de su último conteo físico,
    // aunque el ajuste a la existencia cacheada todavía no se haya aplicado.
    const anteriores = await cliente.conteoPanaderia.findMany({
      where: { articuloId: { in: ids }, fecha: { lt: fecha }, fechaRegistro: { lte: inicio } },
      distinct: ['articuloId'],
      orderBy: [{ articuloId: 'asc' }, { fecha: 'desc' }, { fechaRegistro: 'desc' }, { id: 'desc' }],
      select: { articuloId: true, cantidadFisica: true, fechaRegistro: true },
    });
    if (anteriores.length === 0) return saldos;
    const anteriorPorArticulo = new Map(anteriores.map((conteo) => [conteo.articuloId, conteo]));
    for (const anterior of anteriores)
      saldos.set(anterior.articuloId, anterior.cantidadFisica);
    const desde = new Date(Math.min(...anteriores.map((conteo) => conteo.fechaRegistro.getTime())));
    const movimientos = await cliente.movimientoPanaderia.findMany({
      where: {
        articuloId: { in: anteriores.map((conteo) => conteo.articuloId) },
        fecha: { gt: desde, lt: inicio },
        tipo: { not: 'AJUSTE_CONTEO' },
      },
      select: { articuloId: true, tipo: true, existenciaAntes: true, existenciaDespues: true, fecha: true },
    });
    for (const movimiento of movimientos) {
      const anterior = anteriorPorArticulo.get(movimiento.articuloId);
      if (!anterior || movimiento.tipo === 'AJUSTE_CONTEO' || movimiento.fecha <= anterior.fechaRegistro)
        continue;
      saldos.set(movimiento.articuloId, saldos.get(movimiento.articuloId)!
        .plus(movimiento.existenciaDespues.minus(movimiento.existenciaAntes)));
    }
    return saldos;
  }

  async crearCaja(nombre: string) {
    return this.prisma.caja.create({ data: { nombre_caja: nombre.trim(), area: 'PANADERIA' } });
  }

  listarTransferencias() {
    return this.prisma.transferenciaPanaderia.findMany({
      include: {
        articulo: true,
        producto: true,
        ingrediente: true,
        cuentaPorPagar: { include: { pagos: true } },
        pagos: true,
      },
      orderBy: { fechaSalida: 'desc' },
      take: 100,
    });
  }

  async crearTransferencia(usuarioId: number, dto: CrearTransferenciaPanaderiaDto) {
    if (Number(dto.productoDestinoId !== undefined) +
      Number(dto.ingredienteDestinoId !== undefined) !== 1)
      throw new UnprocessableEntityException('Selecciona un producto o ingrediente de restaurante');
    const existente = await this.prisma.transferenciaPanaderia.findUnique({
      where: { claveOperacion: dto.claveOperacion }, include: { cuentaPorPagar: true },
    });
    if (existente) return existente;
    try { return await this.prisma.$transaction(async (tx) => {
      const articulo = await this.bloquearArticulo(tx, dto.articuloId);
      if (!articulo.activo) throw new ConflictException('El articulo esta desactivado');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException('Este articulo se cuenta en unidades enteras');
      if (articulo.existencia.lessThan(dto.cantidad))
        throw new ConflictException(`Existencia insuficiente de ${articulo.nombre}`);
      if (dto.productoDestinoId) {
        if (articulo.unidad !== 'UNIDADES')
          throw new UnprocessableEntityException('El producto de restaurante recibe unidades enteras');
        const producto = await tx.producto.findUnique({ where: { id_producto: dto.productoDestinoId } });
        if (!producto || !producto.habilitado_producto)
          throw new UnprocessableEntityException('Producto destino no disponible');
      }
      if (dto.ingredienteDestinoId) {
        const ingrediente = await tx.ingrediente.findUnique({ where: { id_ingrediente: dto.ingredienteDestinoId } });
        if (!ingrediente)
          throw new UnprocessableEntityException('Ingrediente destino no disponible');
        if (ingrediente.unidades_ingrediente !== articulo.unidad)
          throw new UnprocessableEntityException('Las unidades de origen y destino deben coincidir');
      }
      const montoTotal = new Prisma.Decimal(dto.cantidad).times(dto.precioUnitario);
      if (!montoTotal.isInteger())
        throw new UnprocessableEntityException('El valor del traslado debe ser un numero entero de pesos');
      const transferencia = await tx.transferenciaPanaderia.create({
        data: {
          claveOperacion: dto.claveOperacion,
          articuloId: articulo.id,
          cantidad: dto.cantidad,
          precioUnitario: dto.precioUnitario,
          montoTotal,
          concepto: dto.concepto.trim(),
          productoDestinoId: dto.productoDestinoId,
          ingredienteDestinoId: dto.ingredienteDestinoId,
        },
      });
      const proveedor = await tx.proveedor.upsert({
        where: { area_nombre_proveedor: { area: 'RESTAURANTE', nombre_proveedor: 'Panaderia (traslados internos)' } },
        create: { nombre_proveedor: 'Panaderia (traslados internos)' },
        update: {},
      });
      const cuenta = await tx.cuentaPorPagar.create({
        data: {
          id_proveedor_cuentaPorPagar: proveedor.id_proveedor,
          concepto_cuentaPorPagar: dto.concepto.trim(),
          documento_cuentaPorPagar: `TR-PAN-${transferencia.id}`,
          monto_total_cuentaPorPagar: montoTotal,
          detalles: {
            create: [{
              id_producto_detalleCuenta: dto.productoDestinoId,
              id_ingrediente_detalleCuenta: dto.ingredienteDestinoId,
              cantidad_detalleCuenta: dto.cantidad,
              precio_unitario_detalleCuenta: dto.precioUnitario,
            }],
          },
        },
      });
      await tx.transferenciaPanaderia.update({
        where: { id: transferencia.id },
        data: { cuentaPorPagarId: cuenta.id_cuentaPorPagar },
      });
      await this.mover(tx, articulo, -dto.cantidad, usuarioId, 'TRANSFERENCIA',
        dto.concepto.trim(), { transferenciaId: transferencia.id });
      return tx.transferenciaPanaderia.findUniqueOrThrow({
        where: { id: transferencia.id }, include: { cuentaPorPagar: true },
      });
    }); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const repetida = await this.prisma.transferenciaPanaderia.findUnique({
          where: { claveOperacion: dto.claveOperacion }, include: { cuentaPorPagar: true },
        });
        if (repetida) return repetida;
      }
      throw error;
    }
  }

  async recibirTransferencia(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaPanaderia" WHERE id = ${id} FOR UPDATE`;
      const transferencia = await tx.transferenciaPanaderia.findUnique({
        where: { id }, include: { cuentaPorPagar: { include: { detalles: true } } },
      });
      if (!transferencia) throw new NotFoundException('Transferencia no encontrada');
      if (transferencia.fechaRecepcion)
        throw new ConflictException('La transferencia ya fue recibida');
      const cuenta = transferencia.cuentaPorPagar;
      if (!cuenta) throw new ConflictException('La cuenta por pagar no esta vinculada');
      if (cuenta.fecha_recepcion_mercancia)
        throw new ConflictException('La cuenta ya tiene recepcion registrada');
      const detalle = cuenta.detalles[0];
      if (transferencia.ingredienteDestinoId && detalle) {
        await tx.movimientoInventario.create({
          data: {
            id_ingrediente_movimiento: transferencia.ingredienteDestinoId,
            id_usuario_movimiento: usuarioId,
            id_detalleCuentaPorPagar_movimiento: detalle.id_detalleCuentaPorPagar,
            tipo_movimiento: 'ENTRADA',
            cantidad_movimiento: transferencia.cantidad,
            motivo_movimiento: `Transferencia panaderia #${id}`,
          },
        });
        await tx.ingrediente.update({
          where: { id_ingrediente: transferencia.ingredienteDestinoId },
          data: { stock_ingrediente: { increment: transferencia.cantidad } },
        });
      }
      const fecha = new Date();
      await tx.cuentaPorPagar.update({
        where: { id_cuentaPorPagar: cuenta.id_cuentaPorPagar },
        data: {
          fecha_recepcion_mercancia: fecha,
          id_usuario_recibe_mercancia: usuarioId,
        },
      });
      return tx.transferenciaPanaderia.update({
        where: { id }, data: { fechaRecepcion: fecha },
        include: { cuentaPorPagar: true },
      });
    });
  }

  async confirmarIngresoTransferencia(
    id: number, usuarioId: number, dto: ConfirmarIngresoTransferenciaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaPanaderia" WHERE id = ${id} FOR UPDATE`;
      const transferencia = await tx.transferenciaPanaderia.findUnique({
        where: { id }, include: { cuentaPorPagar: { include: { pagos: true } }, pagos: true },
      });
      if (!transferencia) throw new NotFoundException('Transferencia no encontrada');
      const pago = transferencia.cuentaPorPagar?.pagos.find(
        (p) => p.id_pagoCuentaPorPagar === dto.pagoCuentaPorPagarId,
      );
      if (!pago) throw new UnprocessableEntityException('El pago no pertenece a esta transferencia');
      if (transferencia.pagos.some((p) => p.pagoCuentaPorPagarId === pago.id_pagoCuentaPorPagar))
        throw new ConflictException('Este ingreso ya fue confirmado en panaderia');
      const turno = await tx.turno.findFirst({
        where: { id_usuario_turno: usuarioId, estado_turno: 'ABIERTO', caja: { area: 'PANADERIA' } },
      });
      if (!turno) throw new ConflictException('Abre un turno de panaderia para recibir el pago');
      await tx.$queryRaw`SELECT "id_turno" FROM "Turno" WHERE "id_turno" = ${turno.id_turno} FOR UPDATE`;
      const sigueAbierto = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });
      if (sigueAbierto.estado_turno !== 'ABIERTO')
        throw new ConflictException('El turno ya fue cerrado');
      const ingreso = await tx.pagoTransferenciaPanaderia.create({
        data: {
          transferenciaId: id,
          pagoCuentaPorPagarId: pago.id_pagoCuentaPorPagar,
          turnoId: turno.id_turno,
          metodo: pago.metodo_pagoCuentaPorPagar,
          monto: pago.monto_pagoCuentaPorPagar,
          concepto: transferencia.concepto,
        },
      });
      if (pago.metodo_pagoCuentaPorPagar === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: {
            id_turno_mc: turno.id_turno,
            tipo_mc: 'INGRESO',
            monto_mc: pago.monto_pagoCuentaPorPagar,
            concepto_mc: `Cobro transferencia panaderia #${id}`,
          },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { increment: pago.monto_pagoCuentaPorPagar } },
        });
      }
      const confirmado = transferencia.pagos.reduce((total, p) => total.plus(p.monto), pago.monto_pagoCuentaPorPagar);
      if (confirmado.equals(transferencia.montoTotal)) {
        await tx.transferenciaPanaderia.update({ where: { id }, data: { fechaPago: new Date() } });
      }
      return ingreso;
    });
  }

  listarTransferenciasRestaurante() {
    return this.prisma.transferenciaRestaurantePanaderia.findMany({
      include: { ingrediente: true, articuloDestino: true },
      orderBy: { fechaSalida: 'desc' },
      take: 100,
    });
  }

  async crearTransferenciaRestaurante(usuarioId: number, dto: CrearTransferenciaRestauranteDto) {
    const existente = await this.prisma.transferenciaRestaurantePanaderia.findUnique({
      where: { claveOperacion: dto.claveOperacion },
    });
    if (existente) return existente;
    try { return await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id_ingrediente: number }[]>`
        SELECT id_ingrediente FROM "Ingrediente" WHERE id_ingrediente = ${dto.ingredienteId} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Ingrediente de restaurante no encontrado');
      const ingrediente = await tx.ingrediente.findUniqueOrThrow({ where: { id_ingrediente: dto.ingredienteId } });
      const articulo = await this.bloquearArticulo(tx, dto.articuloDestinoId);
      if (!articulo.activo || articulo.tipo !== 'INSUMO')
        throw new UnprocessableEntityException('El destino debe ser un insumo activo de panaderia');
      if (ingrediente.unidades_ingrediente !== articulo.unidad)
        throw new UnprocessableEntityException('Las unidades de origen y destino deben coincidir');
      if (articulo.unidad === 'UNIDADES' && !Number.isInteger(dto.cantidad))
        throw new UnprocessableEntityException('Este insumo se traslada en unidades enteras');
      if (ingrediente.stock_ingrediente.lessThan(dto.cantidad))
        throw new ConflictException(`Existencia insuficiente de ${ingrediente.nombre_ingrediente}`);
      const montoTotal = new Prisma.Decimal(dto.cantidad).times(dto.precioUnitario);
      if (!montoTotal.isInteger())
        throw new UnprocessableEntityException('El valor del traslado debe ser un numero entero de pesos');
      const transferencia = await tx.transferenciaRestaurantePanaderia.create({
        data: {
          claveOperacion: dto.claveOperacion,
          ingredienteId: dto.ingredienteId,
          articuloDestinoId: dto.articuloDestinoId,
          cantidad: dto.cantidad,
          precioUnitario: dto.precioUnitario,
          montoTotal,
          concepto: dto.concepto.trim(),
          usuarioSalidaId: usuarioId,
        },
      });
      await tx.ingrediente.update({
        where: { id_ingrediente: dto.ingredienteId },
        data: { stock_ingrediente: { decrement: dto.cantidad } },
      });
      await tx.movimientoInventario.create({
        data: {
          id_ingrediente_movimiento: dto.ingredienteId,
          id_usuario_movimiento: usuarioId,
          tipo_movimiento: 'TRANSFERENCIA',
          cantidad_movimiento: dto.cantidad,
          motivo_movimiento: `Traslado a panaderia #${transferencia.id}`,
        },
      });
      return transferencia;
    }); } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const repetida = await this.prisma.transferenciaRestaurantePanaderia.findUnique({
          where: { claveOperacion: dto.claveOperacion },
        });
        if (repetida) return repetida;
      }
      throw error;
    }
  }

  async recibirTransferenciaRestaurante(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaRestaurantePanaderia" WHERE id = ${id} FOR UPDATE`;
      const transferencia = await tx.transferenciaRestaurantePanaderia.findUnique({ where: { id } });
      if (!transferencia) throw new NotFoundException('Transferencia no encontrada');
      if (transferencia.fechaRecepcion) throw new ConflictException('La mercancia ya fue recibida');
      const articulo = await this.bloquearArticulo(tx, transferencia.articuloDestinoId);
      if (!articulo.activo) throw new ConflictException('El insumo destino fue desactivado');
      await this.mover(tx, articulo, Number(transferencia.cantidad), usuarioId, 'RECEPCION',
        `Traslado desde restaurante #${id}`, { transferenciaRestauranteId: id });
      return tx.transferenciaRestaurantePanaderia.update({
        where: { id }, data: { fechaRecepcion: new Date(), usuarioRecibeId: usuarioId },
      });
    });
  }

  async pagarTransferenciaRestaurante(id: number, usuarioId: number, dto: PagarTransferenciaRestauranteDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaRestaurantePanaderia" WHERE id = ${id} FOR UPDATE`;
      const transferencia = await tx.transferenciaRestaurantePanaderia.findUnique({ where: { id } });
      if (!transferencia) throw new NotFoundException('Transferencia no encontrada');
      if (!transferencia.fechaRecepcion) throw new ConflictException('Confirma la recepcion antes de pagar');
      if (transferencia.fechaPago) throw new ConflictException('La transferencia ya fue pagada');
      const turno = await tx.turno.findFirst({
        where: { id_usuario_turno: usuarioId, estado_turno: 'ABIERTO', caja: { area: 'PANADERIA' } },
      });
      if (!turno) throw new ConflictException('Abre un turno de panaderia antes de pagar');
      await tx.$queryRaw`SELECT "id_turno" FROM "Turno" WHERE "id_turno" = ${turno.id_turno} FOR UPDATE`;
      const abierto = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });
      if (abierto.estado_turno !== 'ABIERTO') throw new ConflictException('El turno ya fue cerrado');
      if (dto.metodo === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: { id_turno_mc: turno.id_turno, tipo_mc: 'EGRESO', monto_mc: transferencia.montoTotal,
            concepto_mc: `Pago traslado restaurante #${id}` },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { decrement: transferencia.montoTotal } },
        });
      }
      return tx.transferenciaRestaurantePanaderia.update({
        where: { id }, data: { fechaPago: new Date(), usuarioPagoId: usuarioId,
          turnoPagoId: turno.id_turno, metodoPago: dto.metodo },
      });
    });
  }

  async confirmarIngresoRestaurante(id: number, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransferenciaRestaurantePanaderia" WHERE id = ${id} FOR UPDATE`;
      const transferencia = await tx.transferenciaRestaurantePanaderia.findUnique({ where: { id } });
      if (!transferencia) throw new NotFoundException('Transferencia no encontrada');
      if (!transferencia.fechaPago) throw new ConflictException('La panaderia aun no registro el pago');
      if (transferencia.fechaConfirmacionIngreso) throw new ConflictException('El ingreso ya fue confirmado');
      const turno = await tx.turno.findFirst({
        where: { id_usuario_turno: usuarioId, estado_turno: 'ABIERTO', caja: { area: 'RESTAURANTE' } },
      });
      if (!turno) throw new ConflictException('Abre un turno de restaurante para recibir el pago');
      await tx.$queryRaw`SELECT "id_turno" FROM "Turno" WHERE "id_turno" = ${turno.id_turno} FOR UPDATE`;
      const abierto = await tx.turno.findUniqueOrThrow({ where: { id_turno: turno.id_turno } });
      if (abierto.estado_turno !== 'ABIERTO') throw new ConflictException('El turno ya fue cerrado');
      if (transferencia.metodoPago === 'EFECTIVO') {
        await tx.movimientoCaja.create({
          data: { id_turno_mc: turno.id_turno, tipo_mc: 'INGRESO', monto_mc: transferencia.montoTotal,
            concepto_mc: `Cobro traslado a panaderia #${id}` },
        });
        await tx.turno.update({
          where: { id_turno: turno.id_turno },
          data: { monto_cierre_esperado: { increment: transferencia.montoTotal } },
        });
      }
      return tx.transferenciaRestaurantePanaderia.update({
        where: { id }, data: { fechaConfirmacionIngreso: new Date(), usuarioConfirmaId: usuarioId,
          turnoIngresoId: turno.id_turno },
      });
    });
  }

  listarCajas() {
    return this.prisma.caja.findMany({
      where: { area: 'PANADERIA' },
      include: { turnos: { where: { estado_turno: 'ABIERTO' } } },
      orderBy: { id_caja: 'asc' },
    });
  }

  async aplicarConteoCierre(tx: Prisma.TransactionClient, usuarioId: number, fecha: Date) {
    const estado = await this.estadoConteo(fecha, tx);
    if (!estado.completo) {
      throw new ConflictException(
        `Completa el conteo de panaderia del ${estado.fecha}. ` +
        `Pendientes: ${[...estado.faltantes, ...estado.recontar].join(', ') || 'configura articulos activos'}`,
      );
    }
    const configurados = new Set(estado.articulosConfigurados);
    for (const conteo of estado.detalle.filter((fila) => configurados.has(fila.articuloId))) {
      const articulo = await this.bloquearArticulo(tx, conteo.articuloId);
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
    if (!filas[0]) throw new NotFoundException('Articulo de panaderia no encontrado');
    return tx.articuloPanaderia.findUniqueOrThrow({ where: { id } });
  }

  private async mover(
    tx: Prisma.TransactionClient,
    articulo: Awaited<ReturnType<BakeryService['bloquearArticulo']>>,
    delta: number | Prisma.Decimal,
    usuarioId: number,
    tipo: 'PRODUCCION' | 'CONSUMO_RECETA' | 'RECEPCION' | 'VENTA' | 'TRANSFERENCIA' | 'MERMA' | 'SALIDA_MANUAL',
    concepto: string,
    referencias?: { ventaId?: number; transferenciaId?: number; transferenciaRestauranteId?: number; recetaId?: number },
  ) {
    const despues = articulo.existencia.plus(delta);
    if (despues.lessThan(0))
      throw new ConflictException(`Existencia insuficiente de ${articulo.nombre}`);
    await tx.articuloPanaderia.update({
      where: { id: articulo.id }, data: { existencia: despues },
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
