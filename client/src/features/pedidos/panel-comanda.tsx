import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { CheckCircle2, Wallet } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { useEsCaja } from '@/stores/auth.store'
import {
  useCancelarItem,
  useCancelarPedido,
  useEntregarComanda,
  useDespacharComanda,
  useEnviarComanda,
} from '@/features/pedidos/api'
import { useReimprimirComanda } from '@/features/impresion/api'
import { itemAPayload, totalItemCarrito, useCarritoStore, type ItemCarrito } from '@/features/pedidos/carrito.store'
import type { Comanda, DetalleComanda, Pedido } from '@/types/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { comandaEstaPagada, errorATexto, pedidoEstaPagado } from './comun'
import { VistaPorCuenta } from './vista-por-cuenta'

// El panel de enviados se puede mirar por ronda de cocina o por cuenta.
type VistaPanel = 'comanda' | 'cuenta'

// Referencia estable para pedidos sin borrador: un selector que devuelva
// `?? []` crea un array nuevo en cada render y dispara un bucle infinito.
const CARRITO_VACIO: ItemCarrito[] = []

export function PanelComanda({ pedido, editable }: { pedido: Pedido; editable: boolean }) {
  const idPedido = pedido.id_pedido
  const navigate = useNavigate()
  const borrador = useCarritoStore((s) => s.carritos[idPedido]) ?? CARRITO_VACIO
  const quitar = useCarritoStore((s) => s.quitar)
  const limpiar = useCarritoStore((s) => s.limpiar)
  const guardar = useEnviarComanda(idPedido)
  const cancelarPedido = useCancelarPedido(idPedido)
  const esCaja = useEsCaja()
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(false)
  const [vistaElegida, setVistaElegida] = useState<{
    idPedido: number
    vista: VistaPanel
  } | null>(null)

  const comandas = pedido.comandas ?? []
  const vistaPredeterminada: VistaPanel = pedido.modalidad_cuenta_pedido === 'POR_CUENTA' ? 'cuenta' : 'comanda'
  const vista = vistaElegida?.idPedido === idPedido ? vistaElegida.vista : vistaPredeterminada
  const cuentasPorId = useMemo(
    () => new Map((pedido.subcuentas ?? []).map((cuenta) => [cuenta.id_subcuenta, cuenta.nombre_subcuenta])),
    [pedido.subcuentas],
  )

  const totalBorrador = borrador.reduce((acc, item) => acc + totalItemCarrito(item), 0)

  // Total del pedido: todas las filas no canceladas (padres e hijos) de todas
  // las comandas, igual que factura el backend.
  const detallesEnviados = (pedido.comandas ?? []).flatMap((c) => c.detalles ?? [])
  const totalEnviado = detallesEnviados
    .filter((d) => d.estado_dc !== 'CANCELADO')
    .reduce((acc, d) => acc + Number(d.precio_unitario_dc) * d.cantidad_producto_dc, 0)
  const pagado = borrador.length === 0 && pedidoEstaPagado(pedido)

  function guardarComanda() {
    if (borrador.length === 0) return
    guardar
      .mutateAsync(borrador.map(itemAPayload))
      .then(() => {
        limpiar(idPedido)
        toast.success('Ronda guardada; ya puede cobrarse o enviarse a preparacion')
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <aside className="flex w-full shrink-0 flex-col bg-surface-low lg:h-svh lg:w-96">
      <div className="border-b-4 border-primary px-5 py-4">
        <p className="micro-label">Comanda en curso</p>
      </div>

      <div className="scrollbar-fina min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Borrador */}
        {borrador.length > 0 ? (
          <ul className="space-y-3">
            {borrador.map((item) => (
              <ItemBorrador
                key={item.uid}
                item={item}
                cuenta={item.idSubcuenta ? cuentasPorId.get(item.idSubcuenta) : null}
                onQuitar={() => quitar(idPedido, item.uid)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {editable ? 'Toca productos del menu para armar la comanda.' : 'Sin borrador.'}
          </p>
        )}

        {/* Enviadas: dos miradas del mismo pedido. "Por comanda" es la vista
            de cocina (rondas + estado de impresion); "Por cuenta" agrupa por
            subcuenta para dividir y cobrar por separado. */}
        {comandas.length > 0 ? (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="micro-label">Rondas del pedido</p>
              <ToggleVista vista={vista} onCambiar={(nuevaVista) => setVistaElegida({ idPedido, vista: nuevaVista })} />
            </div>

            {vista === 'comanda' ? (
              <div className="space-y-4">
                {comandas.map((comanda, indice) => (
                  <ComandaEnviada
                    key={comanda.id_comanda}
                    comanda={comanda}
                    numero={indice + 1}
                    idPedido={idPedido}
                    editable={editable}
                  />
                ))}
              </div>
            ) : (
              <VistaPorCuenta pedido={pedido} editable={editable} />
            )}
          </div>
        ) : null}
      </div>

      {/* Pie: totales y acciones */}
      <div className="glass-panel space-y-3 border-t border-border p-5">
        {borrador.length > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Por enviar</span>
            <span className="font-heading tabular-nums">{formatearPrecio(totalBorrador)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Total del pedido</span>
          <span className="font-heading text-lg font-semibold tabular-nums text-primary">
            {formatearPrecio(totalEnviado + totalBorrador)}
          </span>
        </div>

        {/* Cobrar: solo roles de caja, mientras el pedido siga abierto. Lleva a
            la pantalla de cobro por cuenta. */}
        {editable && esCaja && comandas.length > 0 && !pagado ? (
          <Button asChild type="button" className="btn-heat w-full gap-2 font-heading uppercase tracking-wide">
            <Link to="/cobro/$idPedido" params={{ idPedido: String(idPedido) }}>
              <Wallet className="size-4" /> Cobrar cuenta
            </Link>
          </Button>
        ) : null}

        {comandas.length > 0 && pagado ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm font-semibold text-secondary">
            <CheckCircle2 className="size-4" /> Pedido completamente pagado
          </div>
        ) : null}

        {editable ? (
          <>
            <Button
              type="button"
              className="btn-heat w-full font-heading uppercase tracking-wide"
              disabled={borrador.length === 0 || guardar.isPending}
              onClick={guardarComanda}
            >
              {guardar.isPending ? 'Guardando…' : `Guardar ronda (${borrador.length})`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn('w-full text-xs', confirmandoCancelacion ? 'text-destructive' : 'text-muted-foreground')}
              disabled={cancelarPedido.isPending}
              onClick={() => {
                if (!confirmandoCancelacion) {
                  setConfirmandoCancelacion(true)
                  return
                }
                cancelarPedido
                  .mutateAsync()
                  .then(() => {
                    limpiar(idPedido)
                    toast.success('Pedido cancelado')
                    // Cancelar la toma del pedido regresa al salon: la vista del
                    // pedido cancelado ya no admite acciones utiles.
                    void navigate({ to: '/mesas' })
                  })
                  .catch((e: unknown) => toast.error(errorATexto(e)))
                  .finally(() => setConfirmandoCancelacion(false))
              }}
            >
              {confirmandoCancelacion ? 'Toca de nuevo para confirmar la cancelacion' : 'Cancelar pedido'}
            </Button>
          </>
        ) : null}
      </div>
    </aside>
  )
}

// Interruptor segmentado entre las dos miradas del panel de enviados.
function ToggleVista({ vista, onCambiar }: { vista: VistaPanel; onCambiar: (v: VistaPanel) => void }) {
  const opciones: { valor: VistaPanel; texto: string }[] = [
    { valor: 'comanda', texto: 'Por comanda' },
    { valor: 'cuenta', texto: 'Por cuenta' },
  ]
  return (
    <div className="inline-flex rounded-lg bg-surface-lowest p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={vista === o.valor}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 ease-out-quart',
            vista === o.valor ? 'bg-surface-high text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

function ItemBorrador({ item, cuenta, onQuitar }: { item: ItemCarrito; cuenta?: string | null; onQuitar: () => void }) {
  const personalizaciones =
    item.tipo === 'producto'
      ? item.personalizaciones.map((p) => `Sin ${p.nombre}`)
      : item.componentes.flatMap((c) => c.personalizaciones.map((p) => `${c.nombre}: sin ${p.nombre}`))

  return (
    <li className="rounded-md border-l-4 border-primary/60 bg-surface-high p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">
          {item.cantidad} × {item.nombre}
        </span>
        <span className="shrink-0 text-sm tabular-nums">{formatearPrecio(totalItemCarrito(item))}</span>
      </div>
      {personalizaciones.length > 0 ? (
        <ul className="mt-1 text-xs text-tertiary">
          {personalizaciones.map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
      ) : null}
      {item.adiciones.length > 0 ? (
        <ul className="mt-1 text-xs text-muted-foreground">
          {item.adiciones.map((a) => (
            <li key={a.idProducto}>
              + {a.cantidad} × {a.nombre} ({formatearPrecio(a.precio * a.cantidad)})
            </li>
          ))}
        </ul>
      ) : null}
      {item.indicaciones ? <p className="mt-1 text-xs italic text-muted-foreground">“{item.indicaciones}”</p> : null}
      {cuenta ? (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Cuenta · {cuenta}</p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={onQuitar}
      >
        Quitar
      </Button>
    </li>
  )
}

function ComandaEnviada({
  comanda,
  numero,
  idPedido,
  editable,
}: {
  comanda: Comanda
  numero: number
  idPedido: number
  editable: boolean
}) {
  const entregarComanda = useEntregarComanda(idPedido)
  const despachar = useDespacharComanda(idPedido)
  const detalles = comanda.detalles ?? []
  const principales = detalles.filter((d) => d.id_detalleComandaPadre_dc === null)
  const hayPendientes = detalles.some((d) => d.estado_dc === 'PREPARANDO')
  const esBorrador = comanda.estado_comanda === 'BORRADOR'

  return (
    <div className="rounded-md bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="micro-label">Ronda {numero}</p>
          {comanda.autorizada_sin_pago &&
          comanda.fecha_regularizacion_pago_comanda === null &&
          !comandaEstaPagada(comanda) ? (
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-destructive">Autorizada sin pago total</p>
          ) : null}
        </div>
        {editable && esBorrador ? (
          <Button
            type="button"
            size="sm"
            className="btn-heat h-7 px-2 text-xs"
            disabled={despachar.isPending}
            onClick={() =>
              despachar
                .mutateAsync(comanda.id_comanda)
                .then(() => toast.success(`Ronda ${numero} enviada a cocina`))
                .catch((e: unknown) => toast.error(errorATexto(e)))
            }
          >
            {despachar.isPending ? 'Enviando…' : 'Enviar a cocina'}
          </Button>
        ) : editable && hayPendientes ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-xs"
            disabled={entregarComanda.isPending}
            onClick={() =>
              entregarComanda
                .mutateAsync(comanda.id_comanda)
                .then(() => toast.success(`Comanda ${numero} entregada`))
                .catch((e: unknown) => toast.error(errorATexto(e)))
            }
          >
            Entregar todo
          </Button>
        ) : null}
      </div>
      {esBorrador ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Borrador persistente · aun no descuenta inventario</p>
      ) : (
        <EstadoImpresiones comanda={comanda} />
      )}
      <ul className="mt-2 space-y-2">
        {principales.map((detalle) => (
          <ItemEnviado key={detalle.id_detalleComanda} detalle={detalle} idPedido={idPedido} editable={editable} />
        ))}
      </ul>
    </div>
  )
}

// Tickets de cocina/barra de la comanda: estado y reimpresion. Si no hay
// impresoras configuradas no aparece nada.
function EstadoImpresiones({ comanda }: { comanda: Comanda }) {
  const reimprimir = useReimprimirComanda()
  const impresiones = comanda.impresiones ?? []
  if (impresiones.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {impresiones.map((impresion) => {
        const etiqueta = impresion.destino_impresion === 'COCINA' ? 'Cocina' : 'Barra'
        return (
          <span key={impresion.id_impresionComanda} className="flex items-center gap-1">
            <span
              className={cn(
                'micro-label rounded-full px-2 py-0.5',
                impresion.estado_impresion === 'IMPRESA' && 'bg-primary/15 !text-primary',
                impresion.estado_impresion === 'FALLIDA' && 'bg-destructive/15 !text-destructive',
                impresion.estado_impresion === 'PENDIENTE' && 'animate-pulse bg-tertiary/15 !text-tertiary',
              )}
              title={impresion.motivo_fallo ?? undefined}
            >
              {etiqueta}:{' '}
              {impresion.estado_impresion === 'IMPRESA'
                ? 'impresa'
                : impresion.estado_impresion === 'FALLIDA'
                  ? 'fallo'
                  : 'imprimiendo'}
            </span>
            {impresion.estado_impresion === 'FALLIDA' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] uppercase text-muted-foreground hover:text-foreground"
                disabled={reimprimir.isPending}
                onClick={() =>
                  reimprimir
                    .mutateAsync({
                      idComanda: comanda.id_comanda,
                      destino: impresion.destino_impresion,
                    })
                    .then(() => toast.success(`Reimpresion de ${etiqueta.toLowerCase()} enviada`))
                    .catch((e: unknown) => toast.error(errorATexto(e)))
                }
              >
                Reimprimir
              </Button>
            ) : null}
          </span>
        )
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-[10px] uppercase text-muted-foreground hover:text-foreground"
        disabled={reimprimir.isPending}
        onClick={() =>
          reimprimir
            .mutateAsync({ idComanda: comanda.id_comanda })
            .then(() => toast.success('Comanda reimpresa'))
            .catch((e: unknown) => toast.error(errorATexto(e)))
        }
      >
        Reimprimir todo
      </Button>
    </div>
  )
}

function ItemEnviado({
  detalle,
  idPedido,
  editable,
}: {
  detalle: DetalleComanda
  idPedido: number
  editable: boolean
}) {
  const cancelarItem = useCancelarItem(idPedido)
  const cancelado = detalle.estado_dc === 'CANCELADO'
  const nombre = detalle.producto?.nombre_producto ?? detalle.combo?.nombre_combo ?? 'Item'

  return (
    <li className={cn(cancelado && 'opacity-50')}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm', cancelado && 'line-through')}>
          {detalle.cantidad_producto_dc} × {nombre}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <EstadoItem estado={detalle.estado_dc} />
          {editable && (detalle.estado_dc === 'PENDIENTE' || detalle.estado_dc === 'PREPARANDO') ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] uppercase text-muted-foreground hover:text-destructive"
              disabled={cancelarItem.isPending}
              onClick={() =>
                cancelarItem
                  .mutateAsync(detalle.id_detalleComanda)
                  .then(() => toast.success('Item cancelado'))
                  .catch((e: unknown) => toast.error(errorATexto(e)))
              }
            >
              Cancelar
            </Button>
          ) : null}
        </span>
      </div>

      <EstadoPagoItem detalle={detalle} />

      <DetalleExtras detalle={detalle} />

      {/* Hijos: componentes de combo y adiciones */}
      {detalle.hijos?.length ? (
        <ul className="mt-1 space-y-0.5 border-l border-border pl-3">
          {detalle.hijos.map((hijo) => {
            const esAdicion = Number(hijo.precio_unitario_dc) > 0
            return (
              <li
                key={hijo.id_detalleComanda}
                className={cn('text-xs', hijo.estado_dc === 'CANCELADO' && 'line-through opacity-60')}
              >
                <span className={cn(esAdicion ? 'text-foreground' : 'text-muted-foreground')}>
                  {esAdicion ? '+ ' : ''}
                  {hijo.cantidad_producto_dc} × {hijo.producto?.nombre_producto ?? 'Producto'}
                  {esAdicion
                    ? ` (${formatearPrecio(Number(hijo.precio_unitario_dc) * hijo.cantidad_producto_dc)})`
                    : ''}
                </span>
                <DetalleExtras detalle={hijo} />
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}

// Personalizaciones e indicaciones de un detalle (padre o hijo).
function DetalleExtras({ detalle }: { detalle: DetalleComanda }) {
  const personalizaciones = detalle.ingredientesPersonalizados ?? []
  return (
    <>
      {personalizaciones.length > 0 ? (
        <ul className="mt-0.5 text-xs text-tertiary">
          {personalizaciones.map((p) => (
            <li key={p.id_detalleComandaIngrediente}>
              {Number(p.cantidad_delta) < 0 ? 'Sin' : 'Extra'}{' '}
              {p.ingrediente?.nombre_ingrediente ?? `ingrediente ${p.id_ingrediente_dci}`}
            </li>
          ))}
        </ul>
      ) : null}
      {detalle.indicaciones_dc ? (
        <p className="mt-0.5 text-xs italic text-muted-foreground">“{detalle.indicaciones_dc}”</p>
      ) : null}
    </>
  )
}

function EstadoItem({ estado }: { estado: DetalleComanda['estado_dc'] }) {
  if (estado === 'PENDIENTE') {
    return <span className="micro-label rounded-full bg-surface-high px-2 py-0.5">Borrador</span>
  }
  if (estado === 'PREPARANDO') {
    return (
      <span className="micro-label animate-pulse rounded-full bg-tertiary/15 px-2 py-0.5 !text-tertiary">
        Preparando
      </span>
    )
  }
  if (estado === 'ENTREGADO') {
    return <span className="micro-label rounded-full bg-primary/15 px-2 py-0.5 !text-primary">Entregado</span>
  }
  return <span className="micro-label rounded-full bg-surface-lowest px-2 py-0.5">Cancelado</span>
}

function EstadoPagoItem({ detalle }: { detalle: DetalleComanda }) {
  if (Number(detalle.precio_unitario_dc) === 0) return null
  const registros = (detalle.facturasDetalle ?? []).filter((registro) => registro.factura.estado_factura !== 'ANULADA')
  const pagado = registros
    .filter((registro) => registro.factura.estado_factura === 'PAGADA')
    .reduce((total, registro) => total + Number(registro.proporcion_facturada_fd), 0)
  const texto = pagado >= 0.9999 ? 'Pagado' : registros.length > 0 ? 'Facturado · pago pendiente' : 'Por cobrar'
  return (
    <span
      className={cn(
        'mt-1 inline-flex text-[10px] font-semibold uppercase tracking-wide',
        pagado >= 0.9999 ? 'text-secondary' : 'text-muted-foreground',
      )}
    >
      {texto}
    </span>
  )
}
