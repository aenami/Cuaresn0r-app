// Muestra operativa aditiva: no borra datos ni toca turnos abiertos existentes.
// node scripts/seed-showcase-local.cjs --plan | --apply | --verify
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
})
const { PrismaService } = require('../dist/src/prisma/prisma.service')
const { crearValoracion } = require('../dist/src/recipes/inventory-valuation')
const url = new URL(process.env.DATABASE_URL)
if (
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/POS'
)
  throw Error('Solo se permite la base POS local.')
const modo = process.argv[2]
if (!['--plan', '--apply', '--verify'].includes(modo))
  throw Error('Usa --plan, --apply o --verify.')
const marca = '[MUESTRA]'
const marcador = `${marca} Distribuciones Centro`
const hoy = new Date(new Date().getTime() - 5 * 3600000)
  .toISOString()
  .slice(0, 10)
const fecha = (d) =>
  new Date(new Date(`${hoy}T00:00:00Z`).getTime() + d * 86400000)
const hora = (d, h, m = 0) =>
  new Date(fecha(d).getTime() + ((h + 5) * 60 + m) * 60000)
const dia = (d) => fecha(d).toISOString().slice(0, 10)
const n = Number
const r = (v) => Math.round(v * 10000) / 10000
const nombre = (texto) => `${marca} ${texto}`
const clave = (texto) => `MUESTRA-${texto}`

async function completarFotos(p) {
  const turnos = await p.turno.findMany({
    where: {
      estado_turno: 'CERRADO',
      movimientosCaja: { some: { concepto_mc: { startsWith: marca } } },
    },
    include: { caja: true },
  })
  const cuentas = await p.cuentaPorPagar.findMany({
    where: { documento_cuentaPorPagar: { startsWith: 'MUESTRA-' } },
    include: { proveedor: true, pagos: true },
  })
  for (const turno of turnos) {
    const fechaTurno = new Date(
      turno.fecha_cierre_turno.getTime() - 5 * 3600000,
    )
      .toISOString()
      .slice(0, 10)
    const filas = cuentas
      .filter(
        (c) =>
          c.area === turno.caja.area &&
          c.fecha_emision_cuentaPorPagar.toISOString().slice(0, 10) <=
            fechaTurno,
      )
      .map((c) => {
        const pagado = c.pagos
          .filter(
            (pago) => pago.fecha_pagoCuentaPorPagar <= turno.fecha_cierre_turno,
          )
          .reduce((sum, pago) => sum + n(pago.monto_pagoCuentaPorPagar), 0)
        return {
          idCuenta: c.id_cuentaPorPagar,
          proveedor: c.proveedor.nombre_proveedor,
          concepto: c.concepto_cuentaPorPagar,
          documento: c.documento_cuentaPorPagar,
          fechaVencimiento:
            c.fecha_vencimiento_cuentaPorPagar?.toISOString() ?? null,
          montoTotal: String(c.monto_total_cuentaPorPagar),
          saldoPendiente: String(n(c.monto_total_cuentaPorPagar) - pagado),
        }
      })
      .filter((fila) => n(fila.saldoPendiente) > 0)
    await p.turno.update({
      where: { id_turno: turno.id_turno },
      data: {
        facturas_pendientes_cierre_turno: {
          total: String(
            filas.reduce((sum, fila) => sum + n(fila.saldoPendiente), 0),
          ),
          cuentas: filas,
          historicoDisponible: true,
        },
      },
    })
  }
}

async function verificar(p) {
  // Al abrir Inventario se crean pendientes de hoy. La muestra histórica se
  // valida por su propio período, no por esos registros ni por el día de ejecución.
  const fechasMuestra = await p.ventaPanaderia.aggregate({
    where: { claveOperacion: { startsWith: 'MUESTRA-' } },
    _min: { fecha: true },
    _max: { fecha: true },
  })
  assert(
    fechasMuestra._min.fecha && fechasMuestra._max.fecha,
    'Falta la muestra de ventas',
  )
  const fechaColombia = (valor) =>
    new Date(valor.getTime() - 5 * 3600000).toISOString().slice(0, 10)
  const desde = new Date(`${fechaColombia(fechasMuestra._min.fecha)}T00:00:00Z`)
  const hasta = new Date(
    Date.parse(`${fechaColombia(fechasMuestra._max.fecha)}T00:00:00Z`) +
      86400000,
  )
  const [ventas, facturas, countsPan, countsRest, hojas, turnos, movimientos] =
    await Promise.all([
      p.ventaPanaderia.findMany({
        where: { claveOperacion: { startsWith: 'MUESTRA-' } },
        include: { detalles: true, pagos: true },
      }),
      p.factura.findMany({
        where: {
          subcuenta: {
            pedido: {
              comandas: {
                some: { detalles: { some: { indicaciones_dc: marca } } },
              },
            },
          },
        },
        include: { pagos: true, detalles: true },
      }),
      p.conteoPanaderia.findMany({
        where: {
          articulo: { nombre: { startsWith: marca } },
          fecha: { gte: desde, lt: hasta },
        },
      }),
      p.conteoInventarioDiario.findMany({
        where: {
          nombre_objetivo_conteoInventario: { startsWith: marca },
          fecha_conteoInventario: { gte: desde, lt: hasta },
        },
      }),
      p.hojaProduccionPanaderia.findMany({
        where: {
          entradas: { some: { claveOperacion: { startsWith: 'MUESTRA-' } } },
        },
        include: { entradas: { include: { movimiento: true } } },
      }),
      p.turno.findMany({
        where: {
          movimientosCaja: { some: { concepto_mc: { startsWith: marca } } },
        },
        include: {
          pagos: true,
          ventasPanaderia: { include: { pagos: true } },
          pagosNomina: true,
          pagosCuentasPorPagar: true,
          movimientosCaja: true,
          ingresosRemisiones: true,
        },
      }),
      p.movimientoPanaderia.findMany({
        where: { articulo: { nombre: { startsWith: marca } } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      }),
    ])
  assert.equal(ventas.length, 42, 'Deben existir 42 ventas de mostrador')
  assert.equal(facturas.length, 28, 'Deben existir 28 cuentas de restaurante')
  assert.equal(turnos.length, 28, 'Deben existir 28 turnos cerrados')
  assert.equal(
    countsPan.length,
    77,
    'Deben existir 77 conteos históricos de panadería',
  )
  assert.equal(
    countsRest.length,
    56,
    'Deben existir 56 conteos históricos de restaurante',
  )
  for (const venta of ventas) {
    assert.equal(
      n(venta.total),
      venta.pagos.reduce((a, pago) => a + n(pago.monto), 0),
    )
    assert.equal(
      n(venta.total),
      venta.detalles.reduce((a, detalle) => a + n(detalle.subtotal), 0),
    )
  }
  for (const factura of facturas)
    assert.equal(
      n(factura.monto_total_factura),
      factura.pagos.reduce((a, pago) => a + n(pago.monto_total_pago), 0),
    )
  for (const hoja of hojas)
    for (const entrada of hoja.entradas) {
      assert.equal(entrada.movimiento.tipo, 'PRODUCCION')
      assert.equal(n(entrada.cantidad), n(entrada.movimiento.cantidad))
      assert.equal(
        n(entrada.subtotal),
        n(entrada.cantidad) * n(entrada.precioUnitarioSnapshot),
      )
    }
  for (const turno of turnos) {
    let esperado = n(turno.monto_apertura_turno)
    esperado += turno.pagos
      .filter((x) => x.metodo_pago === 'EFECTIVO')
      .reduce((a, x) => a + n(x.monto_total_pago), 0)
    esperado += turno.ventasPanaderia.reduce(
      (a, v) =>
        a +
        v.pagos
          .filter((x) => x.metodo === 'EFECTIVO')
          .reduce((b, x) => b + n(x.monto), 0),
      0,
    )
    esperado -= turno.pagosNomina
      .filter((x) => x.metodo_pagoNomina === 'EFECTIVO')
      .reduce((a, x) => a + n(x.monto_pagoNomina), 0)
    esperado -= turno.pagosCuentasPorPagar
      .filter((x) => x.metodo_pagoCuentaPorPagar === 'EFECTIVO')
      .reduce((a, x) => a + n(x.monto_pagoCuentaPorPagar), 0)
    esperado += turno.movimientosCaja.reduce(
      (a, x) => a + (x.tipo_mc === 'INGRESO' ? 1 : -1) * n(x.monto_mc),
      0,
    )
    esperado += turno.ingresosRemisiones
      .filter((x) => x.metodoIngreso === 'EFECTIVO')
      .reduce((a, x) => a + n(x.montoTotal), 0)
    assert.equal(
      r(esperado),
      n(turno.monto_cierre_esperado),
      `Cuadre turno #${turno.id_turno}`,
    )
  }
  const ultimos = new Map()
  for (const movimiento of movimientos) {
    if (ultimos.has(movimiento.articuloId))
      assert.equal(
        n(movimiento.existenciaAntes),
        ultimos.get(movimiento.articuloId),
        'Continuidad de stock',
      )
    assert(n(movimiento.existenciaDespues) >= 0)
    ultimos.set(movimiento.articuloId, n(movimiento.existenciaDespues))
  }
  const articulos = await p.articuloPanaderia.findMany({
    where: { nombre: { startsWith: marca } },
  })
  for (const articulo of articulos)
    assert.equal(n(articulo.existencia), ultimos.get(articulo.id))
  const valoraciones = [
    ...countsPan.map((x) => x.valoracion),
    ...countsRest.map((x) => x.valoracion),
  ]
  for (const valoracion of valoraciones) {
    assert.equal(valoracion.estado, 'VALIDA')
    assert.equal(
      r(n(valoracion.cantidadFaltante) * n(valoracion.precioReferencia)),
      n(valoracion.perdidaEstimada),
    )
  }
  const resultado = {
    periodo: [
      countsPan.map((x) => x.fecha.toISOString().slice(0, 10)).sort()[0],
      countsPan
        .map((x) => x.fecha.toISOString().slice(0, 10))
        .sort()
        .at(-1),
    ],
    articulosPanaderia: articulos.length,
    ventasMostrador: ventas.length,
    cuentasRestaurante: facturas.length,
    turnosCerrados: turnos.length,
    hojasProduccion: hojas.length,
    conteos: valoraciones.length,
    ventasPanaderiaCOP: ventas.reduce((a, x) => a + n(x.total), 0),
    ventasRestauranteCOP: facturas.reduce(
      (a, x) => a + n(x.monto_total_factura),
      0,
    ),
    ingresoEstimadoCOP: valoraciones.reduce(
      (a, x) => a + n(x.ingresoEstimado),
      0,
    ),
    perdidaEstimadaCOP: r(
      valoraciones.reduce((a, x) => a + n(x.perdidaEstimada), 0),
    ),
  }
  console.log(JSON.stringify(resultado, null, 2))
}

async function ejecutar() {
  const p = new PrismaService()
  try {
    await p.$connect()
    if (modo === '--verify') return await verificar(p)
    if (
      await p.proveedor.findUnique({
        where: {
          area_nombre_proveedor: {
            area: 'PANADERIA',
            nombre_proveedor: marcador,
          },
        },
      })
    ) {
      if (modo === '--apply') await completarFotos(p)
      console.log('La muestra ya existe; no se duplicó ningún registro.')
      return await verificar(p)
    }
    const usuarios = await p.usuario.findMany({
      where: { rol: { nombre_rol: { in: ['ADMIN_LOCAL', 'PANADERO'] } } },
      include: { rol: true },
    })
    const adminPan = usuarios.find(
      (x) => x.area === 'PANADERIA' && x.rol.nombre_rol === 'ADMIN_LOCAL',
    )
    const adminRest = usuarios.find(
      (x) => x.area === 'RESTAURANTE' && x.rol.nombre_rol === 'ADMIN_LOCAL',
    )
    const panadero = usuarios.find(
      (x) => x.area === 'PANADERIA' && x.rol.nombre_rol === 'PANADERO',
    )
    const cajas = await p.caja.findMany()
    assert(
      adminPan && adminRest && panadero,
      'Se requieren administradores locales y un panadero existentes',
    )
    if (modo === '--plan') {
      console.log(
        `POS local: catálogo, 42 ventas + 28 cuentas, 28 cierres, 7 días de conteos (${dia(-7)} a ${dia(-1)}), producción, proveedores, nómina, 3 remisiones y metas de hoy. No borra ni modifica cuentas de usuario o turnos abiertos.`,
      )
      return
    }
    assert(
      fs.existsSync(
        path.join(
          __dirname,
          '..',
          'backups',
          'POS-antes-muestra-20261009.dump',
        ),
      ),
      'Se requiere el respaldo local validado antes de aplicar.',
    )

    await p.$transaction(
      async (tx) => {
        const provPan = await tx.proveedor.create({
          data: {
            area: 'PANADERIA',
            nombre_proveedor: marcador,
            contacto_proveedor: 'Camila — distribuidora de prueba',
            telefono_proveedor: '3000000000',
          },
        })
        const provRest = await tx.proveedor.create({
          data: {
            area: 'RESTAURANTE',
            nombre_proveedor: nombre('Abastos del Mercado'),
            contacto_proveedor: 'Andrés — proveedor de prueba',
          },
        })
        const categorias = {}
        for (const [key, etiqueta] of [
          ['pan', 'Panes tradicionales'],
          ['especial', 'Panes especiales'],
          ['postre', 'Dulces y postres'],
          ['bebida', 'Bebidas embotelladas'],
        ])
          categorias[key] = await tx.categoriaPanaderia.create({
            data: { nombre: nombre(etiqueta) },
          })
        const definiciones = [
          ['campesino', 'Pan campesino', 'PANADERIA', 2500, 'pan'],
          ['frances', 'Pan francés', 'PANADERIA', 1800, 'pan'],
          ['queso', 'Pan de queso', 'PANADERIA', 2800, 'pan'],
          ['integral', 'Pan integral', 'PANADERIA', 3500, 'especial'],
          ['croissant', 'Croissant', 'PANADERIA', 4500, 'especial'],
          ['mogolla', 'Mogolla', 'PANADERIA', 1500, 'pan'],
          ['chocolate', 'Brownie', 'PASTELERIA', 6000, 'postre'],
          ['galleta', 'Galleta de avena', 'PASTELERIA', 2500, 'postre'],
          ['torta', 'Porción de torta', 'PASTELERIA', 7500, 'postre'],
          ['rollo', 'Rollo de canela', 'PASTELERIA', 5500, 'postre'],
          ['agua', 'Agua 600 ml', 'EXTERNO', 3000, 'bebida'],
          ['avena', 'Avena botella', 'EXTERNO', 4500, 'bebida'],
          ['gaseosa', 'Gaseosa personal', 'EXTERNO', 4000, 'bebida'],
          ['jugo', 'Jugo en caja', 'EXTERNO', 3500, 'bebida'],
        ]
        const a = {},
          saldoPan = {},
          recetas = {}
        for (const [key, etiqueta, tipo, precio, categoria] of definiciones)
          a[key] = await tx.articuloPanaderia.create({
            data: {
              nombre: nombre(etiqueta),
              tipo,
              unidad: 'UNIDADES',
              precioVenta: precio,
              categoriaId: categorias[categoria].id,
              existencia: 0,
            },
          })
        for (const [key, etiqueta, unidad, costo] of [
          ['harina', 'Harina de trigo', 'kg', 4200],
          ['azucar', 'Azúcar', 'kg', 4800],
          ['mantequilla', 'Mantequilla', 'kg', 22000],
          ['levadura', 'Levadura seca', 'g', 45],
        ])
          a[key] = await tx.articuloPanaderia.create({
            data: {
              nombre: nombre(etiqueta),
              tipo: 'INSUMO',
              unidad,
              precioVenta: 0,
              costoReferencia: costo,
              existencia: 0,
            },
          })
        for (const [key] of definiciones.filter((x) => x[2] !== 'EXTERNO'))
          recetas[key] = await tx.recetaPanaderia.create({
            data: {
              articuloId: a[key].id,
              nombre: nombre(`Receta ${key}`),
              fechaCreacion: hora(-7, 6),
              detalles: {
                create: [
                  { insumoId: a.harina.id, cantidadUnidad: 0.08 },
                  { insumoId: a.azucar.id, cantidadUnidad: 0.015 },
                  { insumoId: a.mantequilla.id, cantidadUnidad: 0.01 },
                ],
              },
            },
          })
        const contarPan = [
          'campesino',
          'frances',
          'queso',
          'integral',
          'croissant',
          'chocolate',
          'torta',
          'agua',
          'avena',
          'harina',
          'azucar',
        ]
        for (const key of contarPan)
          await tx.elementoConteoPanaderia.create({
            data: { articuloId: a[key].id, fechaInicio: fecha(-7) },
          })
        async function moverPan(key, tipo, cantidad, signo, d, h, extras = {}) {
          const antes = saldoPan[key] ?? 0,
            despues = r(antes + signo * cantidad)
          assert(despues >= 0, `Stock insuficiente ${key}`)
          saldoPan[key] = despues
          return await tx.movimientoPanaderia.create({
            data: {
              articuloId: a[key].id,
              usuarioId: adminPan.id_usuario,
              tipo,
              cantidad,
              existenciaAntes: antes,
              existenciaDespues: despues,
              concepto: nombre(tipo.toLowerCase()),
              fecha: hora(d, h),
              ...extras,
            },
          })
        }
        for (const key of Object.keys(a))
          await moverPan(
            key,
            'RECEPCION',
            a[key].tipo === 'INSUMO' ? (key === 'levadura' ? 2000 : 120) : 25,
            1,
            -8,
            8,
          )

        const catBarra = await tx.categoria.create({
          data: {
            nombre_categoria: nombre('Cafetería'),
            destino_categoria: 'BARRA',
          },
        })
        const catCocina = await tx.categoria.create({
          data: {
            nombre_categoria: nombre('Platos'),
            destino_categoria: 'COCINA',
          },
        })
        const productos = {},
          insumos = {},
          saldoRest = {},
          recetasRest = {}
        for (const [key, etiqueta, precio, cocina] of [
          ['cafe', 'Café con leche', 6500, false],
          ['agua', 'Agua 600 ml', 3000, false],
          ['sandwich', 'Sándwich', 12000, true],
          ['almuerzo', 'Almuerzo pollo', 18000, true],
          ['jugo', 'Jugo natural', 5500, false],
          ['arepa', 'Arepa queso', 7500, true],
        ])
          productos[key] = await tx.producto.create({
            data: {
              nombre_producto: nombre(etiqueta),
              precio_producto: precio,
              categoria_producto: cocina
                ? catCocina.id_categoria
                : catBarra.id_categoria,
              descripcion_producto:
                'Producto de muestra para recorrido de la aplicación',
            },
          })
        for (const [key, etiqueta, unidad, costo, inicial, bajo, alto] of [
          ['cafe', 'Café molido', 'kg', 55000, 40, 5, 25],
          ['leche', 'Leche', 'L', 4300, 12, 5, 20],
          ['agua', 'Botellas agua', 'UNIDADES', 1200, 80, 15, 120],
          ['pan', 'Pan recibido', 'UNIDADES', 1800, 20, 5, 50],
          ['pollo', 'Pollo', 'kg', 13500, 4, 5, 15],
        ]) {
          insumos[key] = await tx.ingrediente.create({
            data: {
              nombre_ingrediente: nombre(etiqueta),
              unidades_ingrediente: unidad,
              precio_ingrediente: costo,
              stock_ingrediente: inicial,
              umbral_bajo_ingrediente: bajo,
              umbral_alto_ingrediente: alto,
            },
          })
          saldoRest[key] = inicial
          await tx.movimientoInventario.create({
            data: {
              id_ingrediente_movimiento: insumos[key].id_ingrediente,
              id_usuario_movimiento: adminRest.id_usuario,
              tipo_movimiento: 'ENTRADA',
              cantidad_movimiento: inicial,
              fecha_movimiento: hora(-8, 7),
              motivo_movimiento: nombre('Saldo anterior'),
            },
          })
        }
        const componentes = {
          cafe: [
            ['cafe', 0.018],
            ['leche', 0.15],
          ],
          agua: [['agua', 1]],
          sandwich: [['pan', 1]],
          almuerzo: [['pollo', 0.2]],
        }
        for (const [key, partes] of Object.entries(componentes))
          recetasRest[key] = await tx.receta.create({
            data: {
              id_producto_receta: productos[key].id_producto,
              nombre_receta: `Muestra ${key}`,
              receta_activa: true,
              detalles: {
                create: partes.map(([k, cantidad]) => ({
                  id_ingrediente_detalleReceta: insumos[k].id_ingrediente,
                  cantidad_ingrediente_detalleReceta: cantidad,
                })),
              },
            },
          })
        const contadoRest = ['cafe', 'agua', 'sandwich']
        const inicialProductos = { cafe: 200, agua: 150, sandwich: 100 }
        for (const key of contadoRest)
          await tx.elementoConteoDiario.create({
            data: {
              tipo: 'PRODUCTO',
              idProducto: productos[key].id_producto,
              cantidadInicial: inicialProductos[key],
              fechaInicio: fecha(-7),
            },
          })
        for (const key of Object.keys(insumos))
          await tx.elementoConteoDiario.create({
            data: {
              tipo: 'INGREDIENTE',
              idIngrediente: insumos[key].id_ingrediente,
              cantidadInicial: saldoRest[key],
              fechaInicio: fecha(-7),
            },
          })
        let previoProductos = { ...inicialProductos }
        async function moverRest(key, tipo, cantidad, d, h, extras = {}) {
          saldoRest[key] = r(
            saldoRest[key] + (tipo === 'ENTRADA' ? 1 : -1) * cantidad,
          )
          assert(saldoRest[key] >= 0, `Insumo insuficiente ${key}`)
          await tx.movimientoInventario.create({
            data: {
              id_ingrediente_movimiento: insumos[key].id_ingrediente,
              id_usuario_movimiento: adminRest.id_usuario,
              tipo_movimiento: tipo,
              cantidad_movimiento: cantidad,
              fecha_movimiento: hora(d, h),
              motivo_movimiento: nombre(tipo.toLowerCase()),
              ...extras,
            },
          })
        }

        for (let d = -7; d <= -1; d++) {
          const aperturaPan = { ...saldoPan },
            aperturaRest = { ...saldoRest }
          const entradasPan = {},
            ventasPan = {},
            consumoPan = {},
            trasladoPan = {}
          const entregados = {},
            consumidos = {},
            entradasRest = {}
          const hoja = await tx.hojaProduccionPanaderia.create({
            data: {
              fecha: fecha(d),
              panaderoId: panadero.id_usuario,
              estado: 'FINALIZADA',
              fechaCreacion: hora(d, 6),
              fechaFinalizacion: hora(d, 14),
            },
          })
          for (const [key, receta] of Object.entries(recetas)) {
            const cantidad =
              a[key].tipo === 'PANADERIA' ? 18 + ((d + 7) % 3) : 8
            entradasPan[key] = cantidad
            const movimiento = await moverPan(
              key,
              'PRODUCCION',
              cantidad,
              1,
              d,
              9,
              { recetaId: receta.id },
            )
            await tx.entradaHojaProduccion.create({
              data: {
                hojaId: hoja.id,
                articuloId: a[key].id,
                movimientoId: movimiento.id,
                claveOperacion: clave(`HORNO-${dia(d)}-${key}`),
                nombreArticuloSnapshot: a[key].nombre,
                tipoSnapshot: a[key].tipo,
                cantidad,
                precioUnitarioSnapshot: a[key].precioVenta,
                subtotal: cantidad * n(a[key].precioVenta),
                fechaRegistro: hora(d, 9),
              },
            })
            for (const [insumo, porUnidad] of [
              ['harina', 0.08],
              ['azucar', 0.015],
              ['mantequilla', 0.01],
            ]) {
              const cantidadInsumo = r(cantidad * porUnidad)
              consumoPan[insumo] = r((consumoPan[insumo] ?? 0) + cantidadInsumo)
              await moverPan(
                insumo,
                'CONSUMO_RECETA',
                cantidadInsumo,
                -1,
                d,
                9,
                { recetaId: receta.id, usuarioId: panadero.id_usuario },
              )
            }
          }
          for (const key of ['agua', 'avena', 'gaseosa', 'jugo']) {
            entradasPan[key] = 8
            await moverPan(key, 'RECEPCION', 8, 1, d, 8)
          }
          const cuentaPan = await tx.cuentaPorPagar.create({
            data: {
              area: 'PANADERIA',
              id_proveedor_cuentaPorPagar: provPan.id_proveedor,
              concepto_cuentaPorPagar: nombre('Bebidas recibidas'),
              documento_cuentaPorPagar: clave(`PAN-${dia(d)}`),
              monto_total_cuentaPorPagar: 38400,
              estado_cuentaPorPagar: d % 2 ? 'PARCIAL' : 'PAGADA',
              fecha_emision_cuentaPorPagar: fecha(d),
              fecha_vencimiento_cuentaPorPagar: fecha(d + 8),
              fecha_registro_cuentaPorPagar: hora(d, 8),
              fecha_recepcion_mercancia: hora(d, 8),
              id_usuario_recibe_mercancia: adminPan.id_usuario,
              ...(d % 2 === 0 && {
                fecha_pago_total_cuentaPorPagar: hora(d, 20),
              }),
              detalles: {
                create: ['agua', 'avena', 'gaseosa', 'jugo'].map((k) => ({
                  articuloPanaderiaId: a[k].id,
                  cantidad_detalleCuenta: 8,
                  precio_unitario_detalleCuenta: 1200,
                })),
              },
            },
          })
          const cuentaRest = await tx.cuentaPorPagar.create({
            data: {
              area: 'RESTAURANTE',
              id_proveedor_cuentaPorPagar: provRest.id_proveedor,
              concepto_cuentaPorPagar: nombre('Recepción de leche'),
              documento_cuentaPorPagar: clave(`RES-${dia(d)}`),
              monto_total_cuentaPorPagar: 17200,
              estado_cuentaPorPagar: 'PAGADA',
              fecha_emision_cuentaPorPagar: fecha(d),
              fecha_recepcion_mercancia: hora(d, 8),
              id_usuario_recibe_mercancia: adminRest.id_usuario,
              fecha_pago_total_cuentaPorPagar: hora(d, 20),
              detalles: {
                create: [
                  {
                    id_ingrediente_detalleCuenta: insumos.leche.id_ingrediente,
                    cantidad_detalleCuenta: 4,
                    precio_unitario_detalleCuenta: 4300,
                  },
                ],
              },
            },
            include: { detalles: true },
          })
          entradasRest.leche = 4
          await moverRest('leche', 'ENTRADA', 4, d, 8, {
            id_detalleCuentaPorPagar_movimiento:
              cuentaRest.detalles[0].id_detalleCuentaPorPagar,
          })
          const turnos = {}
          for (const area of ['PANADERIA', 'RESTAURANTE'])
            for (const s of [0, 1])
              turnos[`${area}:${s}`] = await tx.turno.create({
                data: {
                  id_caja_turno: cajas.find((x) => x.area === area).id_caja,
                  id_usuario_turno:
                    area === 'PANADERIA'
                      ? adminPan.id_usuario
                      : adminRest.id_usuario,
                  fecha_apertura_turno: hora(d, s === 0 ? 7 : 14),
                  fecha_cierre_turno: hora(d, s === 0 ? 14 : 21),
                  monto_apertura_turno: 300000,
                  monto_cierre_esperado: 300000,
                  monto_cierre_real_turno: 300000,
                  estado_turno: 'CERRADO',
                  tipo_turno: s === 0 ? 'MANANA' : 'TARDE_NOCHE',
                  facturas_pendientes_cierre_turno: [],
                },
              })
          for (const s of [0, 1]) {
            const turno = turnos[`PANADERIA:${s}`]
            for (let v = 0; v < 3; v++) {
              const keys =
                v === 0
                  ? ['campesino', 'agua', 'chocolate']
                  : v === 1
                    ? ['frances', 'queso', 'avena']
                    : ['integral', 'croissant', 'torta']
              const detalles = keys.map((key, i) => ({
                articuloId: a[key].id,
                nombreSnapshot: a[key].nombre,
                cantidad: 1 + ((i + s + d + 7) % 3),
                precioUnitario: a[key].precioVenta,
                subtotal: (1 + ((i + s + d + 7) % 3)) * n(a[key].precioVenta),
              }))
              const total = detalles.reduce((sum, x) => sum + x.subtotal, 0)
              const venta = await tx.ventaPanaderia.create({
                data: {
                  claveOperacion: clave(`VENTA-${dia(d)}-${s}-${v}`),
                  turnoId: turno.id_turno,
                  fecha: hora(d, s === 0 ? 10 + v : 15 + v),
                  total,
                  concepto: nombre('Venta de mostrador'),
                  detalles: { create: detalles },
                  pagos: {
                    create:
                      v === 0
                        ? [{ metodo: 'EFECTIVO', monto: total }]
                        : v === 1
                          ? [{ metodo: 'TRANSFERENCIA', monto: total }]
                          : [
                              { metodo: 'EFECTIVO', monto: total / 2 },
                              { metodo: 'TARJETA', monto: total / 2 },
                            ],
                  },
                },
              })
              for (let i = 0; i < keys.length; i++) {
                const key = keys[i],
                  cantidad = detalles[i].cantidad
                ventasPan[key] = (ventasPan[key] ?? 0) + cantidad
                await moverPan(
                  key,
                  'VENTA',
                  cantidad,
                  -1,
                  d,
                  s === 0 ? 10 + v : 15 + v,
                  { ventaId: venta.id },
                )
              }
            }
            const turnoR = turnos[`RESTAURANTE:${s}`]
            for (let v = 0; v < 2; v++) {
              const keys =
                v === 0
                  ? ['cafe', 'agua', 'sandwich']
                  : ['cafe', 'almuerzo', 'agua']
              const pedido = await tx.pedido.create({
                data: {
                  mesero_pedido: adminRest.id_usuario,
                  fecha_pedido: hora(d, s === 0 ? 11 : 17, v * 20),
                  estado_pedido: 'CERRADO',
                  fecha_cierre_pedido: hora(d, s === 0 ? 12 : 18, v * 20),
                },
              })
              const sub = await tx.subcuenta.create({
                data: {
                  id_pedido_subcuenta: pedido.id_pedido,
                  nombre_subcuenta: 'Cliente de muestra',
                },
              })
              const comanda = await tx.comanda.create({
                data: {
                  id_pedido_comanda: pedido.id_pedido,
                  estado_comanda: 'ENVIADA',
                  creacion_comanda: hora(d, s === 0 ? 11 : 17, v * 20),
                  fecha_envio_comanda: hora(d, s === 0 ? 11 : 17, v * 20),
                  id_usuario_envia_comanda: adminRest.id_usuario,
                },
              })
              const detalles = []
              for (const key of keys) {
                const cantidad = key === 'cafe' ? 2 : 1
                const detalle = await tx.detalleComanda.create({
                  data: {
                    id_comanda_dc: comanda.id_comanda,
                    id_producto_dc: productos[key].id_producto,
                    id_receta_usada_dc: recetasRest[key]?.id_receta,
                    id_subcuenta_dc: sub.id_subcuenta,
                    estado_dc: 'ENTREGADO',
                    fecha_entrega_dc: hora(d, s === 0 ? 12 : 18, v * 20),
                    cantidad_producto_dc: cantidad,
                    precio_unitario_dc: productos[key].precio_producto,
                    indicaciones_dc: marca,
                  },
                })
                entregados[key] = (entregados[key] ?? 0) + cantidad
                detalles.push(detalle)
                for (const [insumo, porUnidad] of componentes[key] ?? []) {
                  const qty = r(cantidad * porUnidad)
                  consumidos[insumo] = r((consumidos[insumo] ?? 0) + qty)
                  await moverRest(
                    insumo,
                    'SALIDA_RECETA',
                    qty,
                    d,
                    s === 0 ? 11 : 17,
                    { id_detalleComanda_movimiento: detalle.id_detalleComanda },
                  )
                }
              }
              const total = detalles.reduce(
                (sum, x) =>
                  sum + x.cantidad_producto_dc * n(x.precio_unitario_dc),
                0,
              )
              await tx.factura.create({
                data: {
                  id_subcuenta_factura: sub.id_subcuenta,
                  fecha_emision_factura: hora(d, s === 0 ? 11 : 17, v * 20),
                  subtotal_factura: total,
                  monto_servicio_factura: 0,
                  monto_impuestos_factura: 0,
                  monto_total_factura: total,
                  estado_factura: 'PAGADA',
                  detalles: {
                    create: detalles.map((x) => ({
                      id_detalleComanda_fd: x.id_detalleComanda,
                      proporcion_facturada_fd: 1,
                      subtotal_facturado_fd:
                        x.cantidad_producto_dc * n(x.precio_unitario_dc),
                    })),
                  },
                  pagos: {
                    create: (v === 0
                      ? [{ metodo: 'EFECTIVO', monto: total }]
                      : [
                          { metodo: 'EFECTIVO', monto: total / 2 },
                          { metodo: 'TRANSFERENCIA', monto: total / 2 },
                        ]
                    ).map((x) => ({
                      id_turno_pago: turnoR.id_turno,
                      metodo_pago: x.metodo,
                      monto_total_pago: x.monto,
                      subtotal_pago: x.monto,
                      monto_servicio_pago: 0,
                      monto_impuestos_pago: 0,
                      fecha_pago: hora(d, s === 0 ? 11 : 17, v * 20),
                    })),
                  },
                },
              })
            }
            for (const area of ['PANADERIA', 'RESTAURANTE']) {
              const user = area === 'PANADERIA' ? adminPan : adminRest,
                t = turnos[`${area}:${s}`]
              const empleadoId =
                area === 'PANADERIA'
                  ? panadero.id_empleado_usuario
                  : adminRest.id_empleado_usuario
              const devengo = await tx.devengoNomina.create({
                data: {
                  id_empleado_devengoNomina: empleadoId,
                  monto_devengoNomina: 6000,
                  fecha_devengoNomina: fecha(d),
                },
              })
              await tx.pagoNomina.create({
                data: {
                  id_empleado_pagoNomina: empleadoId,
                  id_turno_pagoNomina: t.id_turno,
                  id_usuario_registra_pagoNomina: user.id_usuario,
                  monto_pagoNomina: 6000,
                  metodo_pagoNomina: s === 0 ? 'EFECTIVO' : 'TRANSFERENCIA',
                  fecha_pagoNomina: hora(d, s === 0 ? 13 : 20),
                  observacion_pagoNomina: nombre('Pago de jornada de ejemplo'),
                  detalles: {
                    create: [
                      {
                        id_devengoNomina_pnd: devengo.id_devengoNomina,
                        monto_aplicado_pnd: 6000,
                      },
                    ],
                  },
                },
              })
              await tx.movimientoCaja.create({
                data: {
                  id_turno_mc: t.id_turno,
                  tipo_mc: 'EGRESO',
                  monto_mc: 1500,
                  concepto_mc: nombre('Insumos de aseo'),
                  fecha_mc: hora(d, s === 0 ? 13 : 20, 10),
                },
              })
              const monto =
                area === 'PANADERIA'
                  ? s === 0
                    ? 10000
                    : d % 2 === 0
                      ? 28400
                      : 8000
                  : 8600
              await tx.pagoCuentaPorPagar.create({
                data: {
                  id_cuentaPorPagar_pago:
                    area === 'PANADERIA'
                      ? cuentaPan.id_cuentaPorPagar
                      : cuentaRest.id_cuentaPorPagar,
                  id_turno_pagoCuentaPorPagar: t.id_turno,
                  id_usuario_pagoCuentaPorPagar: user.id_usuario,
                  metodo_pagoCuentaPorPagar:
                    s === 0 ? 'EFECTIVO' : 'TRANSFERENCIA',
                  monto_pagoCuentaPorPagar: monto,
                  fecha_pagoCuentaPorPagar: hora(d, s === 0 ? 13 : 20, 15),
                },
              })
            }
          }
          // Remisión real: excluida de ventas/faltantes de panadería e ingresada al restaurante.
          if ([-7, -4, -1].includes(d)) {
            const pagada = d !== -1
            const deuda = await tx.cuentaPorPagar.create({
              data: {
                area: 'RESTAURANTE',
                id_proveedor_cuentaPorPagar: provRest.id_proveedor,
                concepto_cuentaPorPagar: nombre('Remisión de panadería'),
                documento_cuentaPorPagar: clave(`REM-${dia(d)}`),
                monto_total_cuentaPorPagar: 9000,
                estado_cuentaPorPagar: pagada ? 'PAGADA' : 'PENDIENTE',
                fecha_emision_cuentaPorPagar: fecha(d),
                fecha_recepcion_mercancia: hora(d, 19),
                ...(pagada && { fecha_pago_total_cuentaPorPagar: hora(d, 20) }),
              },
            })
            const remision = await tx.remisionPanaderia.create({
              data: {
                claveAgrupacion: clave(`REM-${dia(d)}`),
                fecha: fecha(d),
                modalidad: 'DIA',
                turnoId: turnos['PANADERIA:1'].id_turno,
                fechaCreacion: hora(d, 19),
                fechaCierre: hora(d, 19, 5),
                cuentaPorPagarId: deuda.id_cuentaPorPagar,
                montoTotal: 9000,
                ...(pagada && {
                  turnoIngresoId: turnos['PANADERIA:1'].id_turno,
                  fechaIngreso: hora(d, 20),
                  metodoIngreso: 'EFECTIVO',
                }),
                detalles: {
                  create: [
                    {
                      claveOperacion: clave(`ENTREGA-${dia(d)}`),
                      articuloId: a.campesino.id,
                      ingredienteDestinoId: insumos.pan.id_ingrediente,
                      usuarioId: adminPan.id_usuario,
                      nombreSnapshot: a.campesino.nombre,
                      cantidad: 5,
                      precioUnitario: 1800,
                      subtotal: 9000,
                      concepto: nombre('Pan para sándwiches'),
                      fechaEntrega: hora(d, 19),
                    },
                  ],
                },
              },
            })
            if (pagada)
              await tx.pagoCuentaPorPagar.create({
                data: {
                  id_cuentaPorPagar_pago: deuda.id_cuentaPorPagar,
                  id_turno_pagoCuentaPorPagar: turnos['RESTAURANTE:1'].id_turno,
                  id_usuario_pagoCuentaPorPagar: adminRest.id_usuario,
                  metodo_pagoCuentaPorPagar: 'EFECTIVO',
                  monto_pagoCuentaPorPagar: 9000,
                  fecha_pagoCuentaPorPagar: hora(d, 20),
                },
              })
            trasladoPan.campesino = 5
            entradasRest.pan = 5
            await moverPan('campesino', 'TRANSFERENCIA', 5, -1, d, 19, {
              remisionId: remision.id,
            })
            await moverRest('pan', 'ENTRADA', 5, d, 19)
          }
          await moverPan('frances', 'SALIDA_MANUAL', 1, -1, d, 19, {
            concepto: nombre('Degustación autorizada'),
          })
          await tx.salidaProductoRestaurante.create({
            data: {
              productoId: productos.sandwich.id_producto,
              cantidad: 1,
              motivo: nombre('Cortesía registrada'),
              usuarioId: adminRest.id_usuario,
              fecha: hora(d, 19),
            },
          })
          let diferenciaPan = 0,
            inconsistencias = 0
          for (const key of contarPan) {
            const perdida =
              d === -5 && key === 'agua'
                ? 2
                : d === -2 && key === 'campesino'
                  ? 3
                  : 0
            const sobrante = d === -3 && key === 'torta' ? 1 : 0
            const fisico = r(saldoPan[key] - perdida + sobrante)
            const justificada = key === 'frances' ? 1 : 0,
              transferencias = trasladoPan[key] ?? 0
            const valoracion = crearValoracion({
              tipoReferencia:
                a[key].tipo === 'INSUMO' ? 'COSTO_UNITARIO' : 'PRECIO_VENTA',
              precioReferencia:
                a[key].tipo === 'INSUMO'
                  ? a[key].costoReferencia
                  : a[key].precioVenta,
              nombre: a[key].nombre,
              unidad: a[key].unidad,
              salidaFisica: r(
                aperturaPan[key] + (entradasPan[key] ?? 0) - fisico,
              ),
              cantidadCorroborada:
                a[key].tipo === 'INSUMO'
                  ? (consumoPan[key] ?? 0)
                  : (ventasPan[key] ?? 0),
              salidasNoValorables: justificada + transferencias,
              fechaValoracion: hora(d, 20, 30),
            })
            diferenciaPan +=
              n(valoracion.perdidaEstimada) - n(valoracion.valorSobrante)
            await tx.conteoPanaderia.create({
              data: {
                fecha: fecha(d),
                articuloId: a[key].id,
                usuarioId: adminPan.id_usuario,
                cantidadInicial: aperturaPan[key],
                entradas: entradasPan[key] ?? 0,
                ventasRegistradas: ventasPan[key] ?? 0,
                transferencias,
                mermas: 0,
                salidasJustificadas: justificada,
                consumoReceta: consumoPan[key] ?? 0,
                cantidadFisica: fisico,
                precioReferencia:
                  a[key].tipo === 'INSUMO'
                    ? a[key].costoReferencia
                    : a[key].precioVenta,
                fechaRegistro: hora(d, 20, 30),
                valoracion,
              },
            })
            if (perdida || sobrante)
              await moverPan(
                key,
                'AJUSTE_CONTEO',
                perdida || sobrante,
                perdida ? -1 : 1,
                d,
                20,
                {
                  fecha: hora(d, 20, 30),
                  concepto: nombre('Ajuste al confirmar conteo'),
                },
              )
          }
          for (const key of contadoRest) {
            const justificada = key === 'sandwich' ? 1 : 0,
              perdida = d === -6 && key === 'agua' ? 2 : 0
            const fisico =
              previoProductos[key] -
              (entregados[key] ?? 0) -
              justificada -
              perdida
            const valoracion = crearValoracion({
              tipoReferencia: 'PRECIO_VENTA',
              precioReferencia: productos[key].precio_producto,
              nombre: productos[key].nombre_producto,
              unidad: 'UNIDADES',
              salidaFisica: previoProductos[key] - fisico,
              cantidadCorroborada: entregados[key] ?? 0,
              salidasNoValorables: justificada,
              fechaValoracion: hora(d, 20, 30),
            })
            await tx.conteoInventarioDiario.create({
              data: {
                fecha_conteoInventario: fecha(d),
                tipo_objetivo_conteoInventario: 'PRODUCTO',
                id_producto_conteoInventario: productos[key].id_producto,
                nombre_objetivo_conteoInventario:
                  productos[key].nombre_producto,
                unidad_objetivo_conteoInventario: 'UNIDADES',
                cantidad_anterior_conteoInventario: previoProductos[key],
                fecha_anterior_conteoInventario: d === -7 ? null : fecha(d - 1),
                cantidad_fisica_conteoInventario: fisico,
                cantidad_salida_conteoInventario: previoProductos[key] - fisico,
                estado_conteoInventario: 'FINALIZADO',
                id_usuario_crea_conteoInventario: adminRest.id_usuario,
                id_usuario_cierra_conteoInventario: adminRest.id_usuario,
                fecha_creacion_conteoInventario: hora(d, 7),
                fecha_finalizacion_conteoInventario: hora(d, 20, 30),
                valoracion,
              },
            })
            previoProductos[key] = fisico
            if (perdida) inconsistencias++
          }
          for (const key of Object.keys(insumos)) {
            const fisico = saldoRest[key]
            const valoracion = crearValoracion({
              tipoReferencia: 'COSTO_UNITARIO',
              precioReferencia: insumos[key].precio_ingrediente,
              nombre: insumos[key].nombre_ingrediente,
              unidad: insumos[key].unidades_ingrediente,
              salidaFisica: r(
                aperturaRest[key] + (entradasRest[key] ?? 0) - fisico,
              ),
              cantidadCorroborada: consumidos[key] ?? 0,
              fechaValoracion: hora(d, 20, 30),
            })
            await tx.conteoInventarioDiario.create({
              data: {
                fecha_conteoInventario: fecha(d),
                tipo_objetivo_conteoInventario: 'INGREDIENTE',
                id_ingrediente_conteoInventario: insumos[key].id_ingrediente,
                nombre_objetivo_conteoInventario:
                  insumos[key].nombre_ingrediente,
                unidad_objetivo_conteoInventario:
                  insumos[key].unidades_ingrediente,
                cantidad_anterior_conteoInventario: aperturaRest[key],
                fecha_anterior_conteoInventario: d === -7 ? null : fecha(d - 1),
                cantidad_entradas_conteoInventario: entradasRest[key] ?? 0,
                cantidad_fisica_conteoInventario: fisico,
                cantidad_salida_conteoInventario: r(
                  aperturaRest[key] + (entradasRest[key] ?? 0) - fisico,
                ),
                stock_sistema_conteoInventario: fisico,
                estado_conteoInventario: 'FINALIZADO',
                id_usuario_crea_conteoInventario: adminRest.id_usuario,
                id_usuario_cierra_conteoInventario: adminRest.id_usuario,
                fecha_creacion_conteoInventario: hora(d, 7),
                fecha_finalizacion_conteoInventario: hora(d, 20, 30),
                valoracion,
              },
            })
          }
          for (const [llave, t] of Object.entries(turnos)) {
            const datos = await tx.turno.findUnique({
              where: { id_turno: t.id_turno },
              include: {
                pagos: true,
                ventasPanaderia: { include: { pagos: true } },
                pagosNomina: true,
                pagosCuentasPorPagar: true,
                movimientosCaja: true,
                ingresosRemisiones: true,
              },
            })
            const efectivo =
              datos.pagos
                .filter((x) => x.metodo_pago === 'EFECTIVO')
                .reduce((sum, x) => sum + n(x.monto_total_pago), 0) +
              datos.ventasPanaderia.reduce(
                (sum, v) =>
                  sum +
                  v.pagos
                    .filter((x) => x.metodo === 'EFECTIVO')
                    .reduce((s, x) => s + n(x.monto), 0),
                0,
              )
            const gastos =
              datos.pagosNomina
                .filter((x) => x.metodo_pagoNomina === 'EFECTIVO')
                .reduce((s, x) => s + n(x.monto_pagoNomina), 0) +
              datos.pagosCuentasPorPagar
                .filter((x) => x.metodo_pagoCuentaPorPagar === 'EFECTIVO')
                .reduce((s, x) => s + n(x.monto_pagoCuentaPorPagar), 0) +
              1500
            const ingreso = datos.ingresosRemisiones.reduce(
              (s, x) => s + n(x.montoTotal),
              0,
            )
            const esperado = 300000 + efectivo - gastos + ingreso
            await tx.turno.update({
              where: { id_turno: t.id_turno },
              data: {
                monto_cierre_esperado: esperado,
                monto_cierre_real_turno:
                  esperado + (d === -5 ? -1000 : d === -3 ? 500 : 0),
                facturas_pendientes_cierre_turno: {
                  total: '0',
                  cuentas: [],
                  historicoDisponible: true,
                },
                ...(llave.endsWith(':1') &&
                  (llave.startsWith('PANADERIA')
                    ? {
                        conteo_panaderia_cierre_turno: {
                          fecha: dia(d),
                          completo: true,
                          valorDiferencia: String(diferenciaPan),
                          totalArticulos: contarPan.length,
                          faltantes: [],
                          recontar: [],
                        },
                      }
                    : {
                        conteo_inventario_cierre_turno: {
                          fecha: dia(d),
                          total: 8,
                          completo: true,
                          inconsistencias,
                        },
                      })),
              },
            })
          }
        }
        for (const [key, articulo] of Object.entries(a))
          await tx.articuloPanaderia.update({
            where: { id: articulo.id },
            data: { existencia: saldoPan[key] },
          })
        for (const [key, ingrediente] of Object.entries(insumos))
          await tx.ingrediente.update({
            where: { id_ingrediente: ingrediente.id_ingrediente },
            data: { stock_ingrediente: saldoRest[key] },
          })
        // Metas visibles hoy/mañana; no generan entradas ficticias en inventario.
        for (const d of [0, 1])
          for (const key of ['campesino', 'queso', 'torta', 'chocolate'])
            await tx.metaProduccionPanaderia.create({
              data: {
                fecha: fecha(d),
                articuloId: a[key].id,
                nombreSnapshot: a[key].nombre,
                tipoSnapshot: a[key].tipo,
                cantidadObjetivo: key === 'torta' ? 12 : 30,
                usuarioCreaId: adminPan.id_usuario,
              },
            })
        for (const key of ['cafe', 'sandwich'])
          await tx.planProduccionDiaria.create({
            data: {
              fecha_planProduccion: fecha(0),
              tipo_objetivo_planProduccion: 'PRODUCTO',
              id_producto_planProduccion: productos[key].id_producto,
              nombre_objetivo_planProduccion: productos[key].nombre_producto,
              unidad_objetivo_planProduccion: 'UNIDADES',
              cantidad_objetivo_planProduccion: 20,
              id_usuario_crea_planProduccion: adminRest.id_usuario,
            },
          })
        // Avance de hoy en una hoja borrador, con sus movimientos reales vinculados.
        const hojaHoy = await tx.hojaProduccionPanaderia.upsert({
          where: {
            fecha_panaderoId: {
              fecha: fecha(0),
              panaderoId: panadero.id_usuario,
            },
          },
          update: {},
          create: {
            fecha: fecha(0),
            panaderoId: panadero.id_usuario,
            fechaCreacion: new Date(Date.now() - 120000),
          },
        })
        if (hojaHoy.estado !== 'FINALIZADA') {
          const movimiento = await moverPan(
            'campesino',
            'PRODUCCION',
            12,
            1,
            0,
            0,
            {
              recetaId: recetas.campesino.id,
              usuarioId: panadero.id_usuario,
              fecha: new Date(Date.now() - 60000),
            },
          )
          await tx.entradaHojaProduccion.create({
            data: {
              hojaId: hojaHoy.id,
              articuloId: a.campesino.id,
              movimientoId: movimiento.id,
              claveOperacion: clave(`HORNO-${hoy}-actual`),
              nombreArticuloSnapshot: a.campesino.nombre,
              tipoSnapshot: 'PANADERIA',
              cantidad: 12,
              precioUnitarioSnapshot: a.campesino.precioVenta,
              subtotal: 12 * n(a.campesino.precioVenta),
              fechaRegistro: movimiento.fecha,
            },
          })
          for (const [key, cantidad] of [
            ['harina', 0.96],
            ['azucar', 0.18],
            ['mantequilla', 0.12],
          ])
            await moverPan(key, 'CONSUMO_RECETA', cantidad, -1, 0, 0, {
              recetaId: recetas.campesino.id,
              usuarioId: panadero.id_usuario,
              fecha: movimiento.fecha,
            })
          for (const key of ['campesino', 'harina', 'azucar', 'mantequilla'])
            await tx.articuloPanaderia.update({
              where: { id: a[key].id },
              data: { existencia: saldoPan[key] },
            })
        }
        await tx.cuentaPorPagar.create({
          data: {
            area: 'PANADERIA',
            id_proveedor_cuentaPorPagar: provPan.id_proveedor,
            documento_cuentaPorPagar: clave('POR-RECIBIR'),
            concepto_cuentaPorPagar: nombre('Compra pendiente de recibir'),
            monto_total_cuentaPorPagar: 42000,
            fecha_emision_cuentaPorPagar: fecha(0),
            fecha_vencimiento_cuentaPorPagar: fecha(3),
            detalles: {
              create: [
                {
                  articuloPanaderiaId: a.harina.id,
                  cantidad_detalleCuenta: 10,
                  precio_unitario_detalleCuenta: 4200,
                },
              ],
            },
          },
        })
      },
      { timeout: 180000, maxWait: 20000 },
    )
    await completarFotos(p)
    await verificar(p)
  } finally {
    await p.$disconnect()
  }
}
ejecutar().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
