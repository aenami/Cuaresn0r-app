// Formas de "include" de Prisma compartidas entre pedidos/comandas/items,
// para que las respuestas de los distintos endpoints del modulo sean consistentes.

export const ITEM_INCLUDE = {
  producto: true,
  combo: true,
  recetaUsada: true,
  ingredientesPersonalizados: { include: { ingrediente: true } },
  // Los hijos (componentes de combo, adiciones) tambien pueden traer
  // personalizaciones de ingredientes propias.
  hijos: {
    include: {
      producto: true,
      ingredientesPersonalizados: { include: { ingrediente: true } },
    },
  },
  subcuentasReparto: true,
  facturasDetalle: {
    include: {
      factura: { select: { id_factura: true, estado_factura: true } },
    },
  },
} as const;

export const COMANDA_INCLUDE = {
  detalles: { include: ITEM_INCLUDE },
  // Estado de los tickets de cocina/barra de esta comanda.
  impresiones: true,
} as const;

export const PEDIDO_INCLUDE = {
  ficha: true,
  mesero: { select: { id_usuario: true, email_usuario: true } },
  subcuentas: {
    include: {
      comentarios: {
        include: {
          usuario: { select: { id_usuario: true, email_usuario: true } },
          usuarioResuelve: {
            select: { id_usuario: true, email_usuario: true },
          },
        },
        orderBy: { fecha_comentarioCuenta: 'desc' as const },
      },
      facturas: { include: { pagos: true, detalles: true } },
    },
  },
  comandas: { include: COMANDA_INCLUDE },
} as const;
