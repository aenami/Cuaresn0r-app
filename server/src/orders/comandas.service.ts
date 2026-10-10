import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../recipes/inventory.service';
import { ImpresionService } from '../printing/impresion.service';
import { PedidosService } from './pedidos.service';
import { Prisma } from '../generated/prisma/client';
import {
  CreateComandaDto,
  ComandaItemDto,
  PersonalizacionIngredienteDto,
} from './dto/create-comanda.dto';
import { COMANDA_INCLUDE } from './orders.includes';
import { StockCompartidoService } from './stock-compartido.service';
import { fechaColombia } from '../recipes/inventory-reconciliation';

@Injectable()
export class ComandasService {
  private readonly logger = new Logger(ComandasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidosService: PedidosService,
    private readonly inventoryService: InventoryService,
    private readonly impresionService: ImpresionService,
    private readonly stockCompartido: StockCompartidoService = new StockCompartidoService(
      prisma,
    ),
  ) {}

  async create(idPedido: number, dto: CreateComandaDto) {
    const comanda = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id_pedido FROM "Pedido" WHERE id_pedido = ${idPedido} FOR UPDATE`;
        const pedido = await tx.pedido.findUnique({
          where: { id_pedido: idPedido },
        });
        if (!pedido) throw new NotFoundException('Pedido no encontrado');
        if (
          pedido.estado_pedido === 'CERRADO' ||
          pedido.estado_pedido === 'CANCELADO' ||
          pedido.fecha_cierre_pedido !== null
        ) {
          throw new ConflictException(
            `No se pueden agregar items: el pedido esta ${pedido.estado_pedido}`,
          );
        }

        // Subcuenta por defecto para items que no especifiquen una: la
        // "Cuenta principal" que se crea automaticamente al abrir el pedido.
        const subcuentaPrincipal = await tx.subcuenta.findFirstOrThrow({
          where: { id_pedido_subcuenta: idPedido },
          orderBy: { id_subcuenta: 'asc' },
        });

        const comanda = await tx.comanda.create({
          data: { id_pedido_comanda: idPedido },
        });

        for (const item of dto.items) {
          await this.crearItem(
            tx,
            idPedido,
            comanda.id_comanda,
            item,
            subcuentaPrincipal.id_subcuenta,
          );
        }

        return tx.comanda.findUniqueOrThrow({
          where: { id_comanda: comanda.id_comanda },
          include: COMANDA_INCLUDE,
        });
      },
      { timeout: 30000 },
    );
    return comanda;
  }

  async enviar(
    idPedido: number,
    idComanda: number,
    idUsuario: number,
    rolUsuario: string,
  ) {
    const comanda = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id_pedido FROM "Pedido" WHERE id_pedido = ${idPedido} FOR UPDATE`;
        const filas = await tx.$queryRaw<Array<{ id_comanda: number }>>`
        SELECT id_comanda FROM "Comanda" WHERE id_comanda = ${idComanda} FOR UPDATE
      `;
        if (!filas[0]) throw new NotFoundException('Comanda no encontrada');

        const actual = await tx.comanda.findUniqueOrThrow({
          where: { id_comanda: idComanda },
          include: {
            pedido: true,
            detalles: {
              include: {
                ingredientesPersonalizados: true,
                facturasDetalle: {
                  include: { factura: { select: { estado_factura: true } } },
                },
              },
            },
          },
        });
        if (actual.id_pedido_comanda !== idPedido)
          throw new NotFoundException('Comanda no encontrada en este pedido');
        if (actual.estado_comanda !== 'BORRADOR')
          throw new ConflictException('Esta comanda ya fue enviada');
        if (
          actual.pedido.estado_pedido === 'CERRADO' ||
          actual.pedido.estado_pedido === 'CANCELADO'
        ) {
          throw new ConflictException(
            `No se puede enviar: el pedido esta ${actual.pedido.estado_pedido}`,
          );
        }

        const comerciales = actual.detalles.filter(
          (detalle) =>
            detalle.estado_dc === 'PENDIENTE' &&
            detalle.precio_unitario_dc
              .times(detalle.cantidad_producto_dc)
              .greaterThan(0),
        );
        const haySinPagar = comerciales.some((detalle) => {
          const proporcionPagada = detalle.facturasDetalle
            .filter((registro) => registro.factura.estado_factura === 'PAGADA')
            .reduce(
              (total, registro) => total.plus(registro.proporcion_facturada_fd),
              new Prisma.Decimal(0),
            );
          return proporcionPagada.lessThan(1);
        });

        if (
          haySinPagar &&
          rolUsuario !== 'ADMIN_LOCAL' &&
          rolUsuario !== 'CAJERO'
        ) {
          throw new ForbiddenException(
            'Un cajero o administrador debe autorizar el envio de productos sin pagar',
          );
        }
        if (
          actual.pedido.tipo_pedido === 'LOCAL' &&
          !haySinPagar &&
          actual.pedido.id_ficha_pedido === null
        ) {
          throw new ConflictException(
            'Asigna una ficha antes de enviar una comanda pagada',
          );
        }

        for (const detalle of actual.detalles.filter(
          (item) => item.estado_dc === 'PENDIENTE',
        )) {
          if (detalle.id_receta_usada_dc !== null) {
            await this.inventoryService.descontarPorReceta(tx, {
              idReceta: detalle.id_receta_usada_dc,
              cantidadProducto: detalle.cantidad_producto_dc,
              idDetalleComanda: detalle.id_detalleComanda,
              deltasPersonalizados: detalle.ingredientesPersonalizados.map(
                (personalizacion) => ({
                  idIngrediente: personalizacion.id_ingrediente_dci,
                  delta: Number(personalizacion.cantidad_delta),
                }),
              ),
            });
          }
        }

        await tx.detalleComanda.updateMany({
          where: { id_comanda_dc: idComanda, estado_dc: 'PENDIENTE' },
          data: { estado_dc: 'PREPARANDO' },
        });
        await tx.comanda.update({
          where: { id_comanda: idComanda },
          data: {
            estado_comanda: 'ENVIADA',
            fecha_envio_comanda: new Date(),
            id_usuario_envia_comanda: idUsuario,
            autorizada_sin_pago: haySinPagar,
          },
        });
        await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

        return tx.comanda.findUniqueOrThrow({
          where: { id_comanda: idComanda },
          include: COMANDA_INCLUDE,
        });
      },
      { timeout: 30000 },
    );

    // La impresion se agenda despues de confirmar la transaccion. El servicio
    // conserva el trabajo aunque la termica no tenga papel o el agente local
    // este temporalmente desconectado.
    void this.impresionService
      .imprimirComanda(comanda.id_comanda)
      .catch((error: unknown) => {
        this.logger.error(
          `Impresion de comanda ${comanda.id_comanda} fallo: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return comanda;
  }

  async entregarComanda(
    idPedido: number,
    idComanda: number,
    idUsuario: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id_pedido FROM "Pedido" WHERE id_pedido = ${idPedido} FOR UPDATE`;
        const comanda = await tx.comanda.findUnique({
          where: { id_comanda: idComanda },
        });
        if (!comanda || comanda.id_pedido_comanda !== idPedido)
          throw new NotFoundException('Comanda no encontrada en este pedido');
        if (comanda.estado_comanda !== 'ENVIADA')
          throw new ConflictException('Primero envia la comanda a preparacion');

        const pendientes = await tx.detalleComanda.findMany({
          where: { id_comanda_dc: idComanda, estado_dc: 'PREPARANDO' },
        });
        for (const detalle of pendientes)
          await this.stockCompartido.entregar(
            tx,
            detalle.id_detalleComanda,
            idUsuario,
          );
        await tx.detalleComanda.updateMany({
          where: { id_comanda_dc: idComanda, estado_dc: 'PREPARANDO' },
          data: { estado_dc: 'ENTREGADO', fecha_entrega_dc: new Date() },
        });

        await this.pedidosService.recalcularEstadoPedido(tx, idPedido);

        return tx.comanda.findUniqueOrThrow({
          where: { id_comanda: idComanda },
          include: COMANDA_INCLUDE,
        });
      },
      { timeout: 30000 },
    );
  }

  private async resolveSubcuenta(
    tx: Prisma.TransactionClient,
    idPedido: number,
    idSubcuenta: number | undefined,
    idDefault: number,
  ) {
    if (idSubcuenta === undefined) return idDefault;
    const subcuenta = await tx.subcuenta.findUnique({
      where: { id_subcuenta: idSubcuenta },
    });
    if (!subcuenta || subcuenta.id_pedido_subcuenta !== idPedido) {
      throw new UnprocessableEntityException(
        `La subcuenta ${idSubcuenta} no pertenece a este pedido`,
      );
    }
    return idSubcuenta;
  }

  private async crearItem(
    tx: Prisma.TransactionClient,
    idPedido: number,
    idComanda: number,
    item: ComandaItemDto,
    idSubcuentaDefault: number,
  ) {
    const esProducto = item.idProducto !== undefined;
    const esCombo = item.idCombo !== undefined;
    if (esProducto === esCombo) {
      throw new BadRequestException(
        'Cada item debe especificar exactamente uno de idProducto o idCombo',
      );
    }
    if (esCombo && item.personalizaciones?.length) {
      throw new BadRequestException(
        'En un combo las personalizaciones van por componente (campo componentes)',
      );
    }
    if (esProducto && item.componentes?.length) {
      throw new BadRequestException(
        'El campo componentes solo aplica a combos',
      );
    }

    const idSubcuenta = await this.resolveSubcuenta(
      tx,
      idPedido,
      item.idSubcuenta,
      idSubcuentaDefault,
    );

    const principal = esProducto
      ? await this.crearDetalleProducto(
          tx,
          idComanda,
          {
            idProducto: item.idProducto!,
            cantidad: item.cantidad,
            indicaciones: item.indicaciones,
            personalizaciones: item.personalizaciones,
            opcionesMenu: item.opcionesMenu,
          },
          idSubcuenta,
        )
      : await this.crearItemCombo(tx, idComanda, item, idSubcuenta);

    // Adiciones: productos con precio propio ligados como hijos del item
    // principal (heredan su subcuenta). Cancelar/reasignar el padre ya los
    // arrastra por la jerarquia generica de DetalleComanda.
    for (const adicion of item.adiciones ?? []) {
      await this.crearDetalleProducto(
        tx,
        idComanda,
        adicion,
        idSubcuenta,
        principal.id_detalleComanda,
      );
    }
  }

  // Crea un DetalleComanda de producto (item directo o adicion hija segun
  // idPadre) con snapshot de precio y receta, personalizaciones y descuento
  // de inventario.
  private async crearDetalleProducto(
    tx: Prisma.TransactionClient,
    idComanda: number,
    datos: {
      idProducto: number;
      cantidad: number;
      indicaciones?: string;
      personalizaciones?: PersonalizacionIngredienteDto[];
      opcionesMenu?: number[];
    },
    idSubcuenta: number,
    idPadre?: number,
  ) {
    const producto = await tx.producto.findUnique({
      where: { id_producto: datos.idProducto },
    });
    if (!producto)
      throw new UnprocessableEntityException(
        `El producto ${datos.idProducto} no existe`,
      );
    if (!producto.habilitado_producto)
      throw new UnprocessableEntityException(
        `El producto ${producto.nombre_producto} no esta habilitado`,
      );
    if (idPadre !== undefined && producto.tipoMenu)
      throw new ConflictException(
        'Los almuerzos configurables se piden directamente, no como adiciones',
      );

    // Snapshot: la receta activa AHORA queda fija en el item para siempre,
    // el costeo historico no depende de cual sea "la receta activa de hoy".
    const recetaActiva = await tx.receta.findFirst({
      where: { id_producto_receta: producto.id_producto, receta_activa: true },
    });

    const detalle = await tx.detalleComanda.create({
      data: {
        id_comanda_dc: idComanda,
        id_producto_dc: producto.id_producto,
        id_receta_usada_dc: recetaActiva?.id_receta,
        id_subcuenta_dc: idSubcuenta,
        cantidad_producto_dc: datos.cantidad,
        precio_unitario_dc: producto.precio_producto, // snapshot: precio de venta al momento del pedido
        ...(datos.indicaciones !== undefined && {
          indicaciones_dc: datos.indicaciones,
        }),
        ...(idPadre !== undefined && { id_detalleComandaPadre_dc: idPadre }),
      },
    });

    if (producto.articuloCompartidoId) {
      if (recetaActiva || producto.tipoMenu)
        throw new ConflictException(
          'Un producto compartido no puede consumir otra receta; se descuenta del stock de panadería',
        );
      if (!producto.precioInternoCompartido)
        throw new ConflictException(
          'Configura el valor interno del producto compartido',
        );
      await this.stockCompartido.reservar(
        tx,
        detalle.id_detalleComanda,
        producto.articuloCompartidoId,
        datos.cantidad,
        producto.precioInternoCompartido,
      );
    }
    if (producto.tipoMenu) {
      if (!recetaActiva)
        throw new ConflictException(
          'El almuerzo necesita una receta base de arroz y ensalada',
        );
      const elegidas = datos.opcionesMenu ?? [];
      const opciones = await tx.menuOpcionDiaria.findMany({
        where: {
          productoId: producto.id_producto,
          fecha: fechaColombia(),
          id: { in: elegidas },
        },
      });
      const grupos =
        producto.tipoMenu === 'EJECUTIVO'
          ? ['CALDO', 'PRINCIPIO', 'PROTEINA']
          : ['PRINCIPIO', 'PROTEINA'];
      if (
        elegidas.length !== grupos.length ||
        opciones.length !== grupos.length ||
        !grupos.every((g) => opciones.filter((o) => o.grupo === g).length === 1)
      )
        throw new ConflictException(
          'Selecciona una opción disponible por cada grupo del almuerzo de hoy',
        );
      for (const opcion of opciones) {
        const componente = await tx.producto.findUniqueOrThrow({
          where: { id_producto: opcion.componenteId },
        });
        if (componente.tipoMenu || componente.articuloCompartidoId)
          throw new ConflictException(
            'Las opciones del almuerzo deben tener receta propia, sin menú anidado ni stock compartido',
          );
        const hijo = await this.crearDetalleProducto(
          tx,
          idComanda,
          { idProducto: opcion.componenteId, cantidad: datos.cantidad },
          idSubcuenta,
          detalle.id_detalleComanda,
        );
        if (!hijo.id_receta_usada_dc)
          throw new ConflictException(
            'Cada opción del almuerzo necesita una receta activa',
          );
        await tx.detalleComanda.update({
          where: { id_detalleComanda: hijo.id_detalleComanda },
          data: { precio_unitario_dc: 0 },
        });
      }
    } else if (datos.opcionesMenu?.length)
      throw new ConflictException(
        'Este producto no es un almuerzo configurable',
      );

    if (datos.personalizaciones?.length) {
      await this.crearPersonalizaciones(
        tx,
        detalle.id_detalleComanda,
        datos.personalizaciones,
      );
    }

    return detalle;
  }

  private async crearItemCombo(
    tx: Prisma.TransactionClient,
    idComanda: number,
    item: ComandaItemDto,
    idSubcuenta: number,
  ) {
    if (item.opcionesMenu?.length)
      throw new ConflictException('Los combos no admiten opciones de almuerzo');
    const combo = await tx.combo.findUnique({
      where: { id_combo: item.idCombo! },
      include: { detallesCombo: true },
    });
    if (!combo)
      throw new UnprocessableEntityException(
        `El combo ${item.idCombo} no existe`,
      );
    if (!combo.combo_activo)
      throw new UnprocessableEntityException(
        `El combo ${combo.nombre_combo} no esta activo`,
      );

    // Personalizaciones por componente: se agrupan por producto (permite
    // entradas repetidas del mismo producto en el DTO) y se valida que cada
    // producto personalizado realmente componga el combo.
    const personalizacionesPorProducto = new Map<
      number,
      PersonalizacionIngredienteDto[]
    >();
    for (const componente of item.componentes ?? []) {
      const lista =
        personalizacionesPorProducto.get(componente.idProducto) ?? [];
      lista.push(...componente.personalizaciones);
      personalizacionesPorProducto.set(componente.idProducto, lista);
    }
    const idsComponentes = new Set(
      combo.detallesCombo.map((d) => d.id_producto_detalleCombo),
    );
    for (const idProducto of personalizacionesPorProducto.keys()) {
      if (!idsComponentes.has(idProducto)) {
        throw new UnprocessableEntityException(
          `El producto ${idProducto} no es componente del combo ${combo.nombre_combo}`,
        );
      }
    }

    // Header: precio real del combo. Los hijos (los productos que lo
    // componen) van con precio 0, ya cobrado en el header (ver seccion 2).
    const header = await tx.detalleComanda.create({
      data: {
        id_comanda_dc: idComanda,
        id_combo_dc: combo.id_combo,
        id_subcuenta_dc: idSubcuenta,
        cantidad_producto_dc: item.cantidad,
        precio_unitario_dc: combo.precio_combo,
        ...(item.indicaciones !== undefined && {
          indicaciones_dc: item.indicaciones,
        }),
      },
    });

    for (const componente of combo.detallesCombo) {
      const cantidadHijo =
        Number(componente.cantidad_detalleCombo) * item.cantidad;
      if (!Number.isInteger(cantidadHijo)) {
        throw new UnprocessableEntityException(
          `La composicion del combo ${combo.nombre_combo} no da una cantidad entera para uno de sus productos`,
        );
      }

      const recetaActiva = await tx.receta.findFirst({
        where: {
          id_producto_receta: componente.id_producto_detalleCombo,
          receta_activa: true,
        },
      });

      const hijo = await tx.detalleComanda.create({
        data: {
          id_comanda_dc: idComanda,
          id_detalleComandaPadre_dc: header.id_detalleComanda,
          id_producto_dc: componente.id_producto_detalleCombo,
          id_receta_usada_dc: recetaActiva?.id_receta,
          id_subcuenta_dc: idSubcuenta, // hereda la subcuenta del header (todo el combo va a una sola subcuenta)
          cantidad_producto_dc: cantidadHijo,
          precio_unitario_dc: 0,
        },
      });
      const productoHijo = await tx.producto.findUniqueOrThrow({
        where: { id_producto: componente.id_producto_detalleCombo },
      });
      if (productoHijo.tipoMenu)
        throw new ConflictException(
          'Los almuerzos configurables se piden directamente, no dentro de combos',
        );
      if (productoHijo.articuloCompartidoId) {
        if (recetaActiva || !productoHijo.precioInternoCompartido)
          throw new ConflictException(
            'Revisa la configuración del producto compartido',
          );
        await this.stockCompartido.reservar(
          tx,
          hijo.id_detalleComanda,
          productoHijo.articuloCompartidoId,
          cantidadHijo,
          productoHijo.precioInternoCompartido,
        );
      }

      // Si el combo repite el mismo producto en varias filas, las
      // personalizaciones se aplican solo a la primera (delete tras consumir).
      const personalizaciones = personalizacionesPorProducto.get(
        componente.id_producto_detalleCombo,
      );
      personalizacionesPorProducto.delete(componente.id_producto_detalleCombo);
      if (personalizaciones?.length) {
        await this.crearPersonalizaciones(
          tx,
          hijo.id_detalleComanda,
          personalizaciones,
        );
      }
    }

    return header;
  }

  // Suma deltas repetidos del mismo ingrediente antes de insertar (seccion 4):
  // evita filas duplicadas y valida que los ingredientes existan.
  private async crearPersonalizaciones(
    tx: Prisma.TransactionClient,
    idDetalleComanda: number,
    personalizaciones: { idIngrediente: number; delta: number }[],
  ) {
    const acumulado = new Map<number, number>();
    for (const p of personalizaciones) {
      acumulado.set(
        p.idIngrediente,
        (acumulado.get(p.idIngrediente) ?? 0) + p.delta,
      );
    }

    const ids = [...acumulado.keys()];
    const ingredientes = await tx.ingrediente.findMany({
      where: { id_ingrediente: { in: ids } },
    });
    if (ingredientes.length !== ids.length) {
      throw new UnprocessableEntityException(
        'Uno o mas ingredientes de la personalizacion no existen',
      );
    }

    const filas = [...acumulado.entries()].map(([idIngrediente, delta]) => ({
      id_detalleComanda_dci: idDetalleComanda,
      id_ingrediente_dci: idIngrediente,
      cantidad_delta: delta,
    }));

    await tx.detalleComandaIngrediente.createMany({ data: filas });

    return [...acumulado.entries()].map(([idIngrediente, delta]) => ({
      idIngrediente,
      delta,
    }));
  }
}
