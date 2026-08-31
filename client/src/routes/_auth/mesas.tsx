import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ban, Bike, CalendarCheck, CircleAlert, Clock, Loader2, Phone, Plus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { mesasQuery, pedidosAbiertosQuery, useAbrirPedido } from '@/features/pedidos/api'
import { DomicilioFormDialog } from '@/features/pedidos/domicilio-form-dialog'
import type { Mesa, Pedido, Zona } from '@/types/api'
import { cn } from '@/lib/utils'
import { formatearPrecio } from '@/lib/formato'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/_auth/mesas')({
  component: PaginaMesas,
})

// Estado "de vista": deriva el estado real de la mesa + su pedido abierto a
// una de estas categorias, sin inventar datos que el backend no guarda.
type EstadoVista = 'LIBRE' | 'OCUPADA' | 'ATENCION' | 'RESERVADA' | 'DESACTIVADA'

const BORDE: Record<EstadoVista, string> = {
  LIBRE: 'border-secondary',
  OCUPADA: 'border-primary shadow-[0_14px_30px_-18px_rgb(255_145_87_/_0.6)]',
  ATENCION: 'border-destructive shadow-[0_14px_30px_-18px_rgb(255_115_81_/_0.55)]',
  RESERVADA: 'border-tertiary',
  DESACTIVADA: 'border-transparent',
}

const COLOR_NUMERO: Record<EstadoVista, string> = {
  LIBRE: 'text-muted-foreground',
  OCUPADA: 'text-primary',
  ATENCION: 'text-destructive',
  RESERVADA: 'text-tertiary',
  DESACTIVADA: 'text-muted-foreground',
}

const COLOR_ETIQUETA: Record<EstadoVista, string> = {
  LIBRE: 'text-muted-foreground',
  OCUPADA: 'text-primary',
  ATENCION: 'text-destructive',
  RESERVADA: 'text-tertiary',
  DESACTIVADA: 'text-muted-foreground',
}

const ICONO: Record<EstadoVista, LucideIcon> = {
  LIBRE: CalendarCheck,
  OCUPADA: Users,
  ATENCION: CircleAlert,
  RESERVADA: Clock,
  DESACTIVADA: Ban,
}

// Total del pedido: todas las filas no canceladas (padres e hijos) de todas
// las comandas, igual que factura el backend (ver pedidos.$idPedido).
function totalPedido(pedido: Pedido): number {
  return (pedido.comandas ?? [])
    .flatMap((c) => c.detalles ?? [])
    .filter((d) => d.estado_dc !== 'CANCELADO')
    .reduce((acc, d) => acc + Number(d.precio_unitario_dc) * d.cantidad_producto_dc, 0)
}

function tiempoTranscurrido(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function vistaDeMesa(mesa: Mesa, pedido: Pedido | undefined): { vista: EstadoVista; etiqueta: string } {
  if (mesa.estado_mesa === 'DESACTIVADA') return { vista: 'DESACTIVADA', etiqueta: 'Fuera de servicio' }
  if (mesa.estado_mesa === 'RESERVADA') return { vista: 'RESERVADA', etiqueta: 'Reservada' }
  if (mesa.estado_mesa === 'LIBRE') return { vista: 'LIBRE', etiqueta: 'Disponible' }
  // OCUPADA: el pedido abierto refina la etiqueta.
  const fallaImpresion = (pedido?.comandas ?? []).some((c) =>
    (c.impresiones ?? []).some((i) => i.estado_impresion === 'FALLIDA'),
  )
  if (fallaImpresion) return { vista: 'ATENCION', etiqueta: 'Revisar impresion' }
  if (pedido?.estado_pedido === 'ENTREGADO') return { vista: 'ATENCION', etiqueta: 'Por cobrar' }
  return { vista: 'OCUPADA', etiqueta: 'En preparacion' }
}

// Items aun por entregar de un pedido (solo padres: combos/productos, no
// adiciones ni componentes), para el pipeline de despacho.
function itemsPendientes(pedido: Pedido): { cantidad: number; nombre: string }[] {
  const out: { cantidad: number; nombre: string }[] = []
  for (const comanda of pedido.comandas ?? []) {
    for (const d of comanda.detalles ?? []) {
      if (d.id_detalleComandaPadre_dc === null && d.estado_dc === 'PREPARANDO') {
        out.push({
          cantidad: d.cantidad_producto_dc,
          nombre: d.producto?.nombre_producto ?? d.combo?.nombre_combo ?? 'Item',
        })
      }
    }
  }
  return out
}

function PaginaMesas() {
  const navigate = useNavigate()
  const { data: mesas, isPending } = useQuery(mesasQuery)
  const { data: pedidosAbiertos } = useQuery(pedidosAbiertosQuery)
  const abrirPedido = useAbrirPedido()
  const [dialogoNuevo, setDialogoNuevo] = useState(false)
  const [dialogoDomicilio, setDialogoDomicilio] = useState(false)

  // Refresca el "tiempo transcurrido" aunque no haya cambios del servidor.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const pedidoPorMesa = new Map<number, Pedido>()
  for (const pedido of pedidosAbiertos ?? []) {
    // Los domicilios no tienen mesa; se listan en su propia seccion.
    if (pedido.mesa_pedido !== null) pedidoPorMesa.set(pedido.mesa_pedido, pedido)
  }

  // Domicilios abiertos, mas antiguos primero (los que llevan mas esperando).
  const domiciliosAbiertos = (pedidosAbiertos ?? [])
    .filter((p) => p.tipo_pedido === 'DOMICILIO')
    .sort((a, b) => new Date(a.fecha_pedido).getTime() - new Date(b.fecha_pedido).getTime())

  const zonas = new Map<number, { zona: Zona; mesas: Mesa[] }>()
  for (const mesa of mesas ?? []) {
    if (!mesa.zona) continue
    const grupo = zonas.get(mesa.id_zona_mesa) ?? { zona: mesa.zona, mesas: [] }
    grupo.mesas.push(mesa)
    zonas.set(mesa.id_zona_mesa, grupo)
  }

  const mesasLibres = (mesas ?? [])
    .filter((m) => m.estado_mesa === 'LIBRE')
    .sort((a, b) => a.numero_mesa - b.numero_mesa)
  const ocupadas = (mesas ?? []).filter((m) => m.estado_mesa === 'OCUPADA').length

  // Pipeline: pedidos con items por entregar, mas antiguos primero (mas urgentes).
  const pipeline = (pedidosAbiertos ?? [])
    .map((pedido) => ({ pedido, pendientes: itemsPendientes(pedido) }))
    .filter((x) => x.pendientes.length > 0)
    .sort((a, b) => new Date(a.pedido.fecha_pedido).getTime() - new Date(b.pedido.fecha_pedido).getTime())

  function alTocarMesa(mesa: Mesa) {
    if (mesa.estado_mesa === 'DESACTIVADA') return

    const pedidoAbierto = pedidoPorMesa.get(mesa.id_mesa)
    if (pedidoAbierto) {
      void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedidoAbierto.id_pedido) } })
      return
    }
    if (mesa.estado_mesa === 'OCUPADA') {
      toast.error('La mesa figura ocupada pero no se encontro su pedido abierto')
      return
    }

    abrirPedido
      .mutateAsync(mesa.id_mesa)
      .then((pedido) => {
        toast.success(`Pedido abierto en la mesa ${mesa.numero_mesa}`)
        void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  if (isPending) {
    return <SalonSkeleton />
  }

  return (
    <div className="flex min-h-full xl:h-svh xl:overflow-hidden">
      {/* Piso: mapa de mesas — en desktop scrollea dentro de su columna */}
      <div className="min-w-0 flex-1 p-6 md:p-10 xl:min-h-0 xl:overflow-y-auto xl:scrollbar-fina">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="micro-label mb-2">Toma de pedidos</p>
            <h1 className="font-heading text-4xl font-semibold tracking-tighter md:text-5xl">Salon</h1>
            <p className="mt-2 text-sm text-muted-foreground tabular-nums">
              {ocupadas} {ocupadas === 1 ? 'mesa ocupada' : 'mesas ocupadas'} · {mesasLibres.length}{' '}
              {mesasLibres.length === 1 ? 'disponible' : 'disponibles'}
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 sm:items-end">
            <Leyenda />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-11 gap-2 px-5 font-heading text-sm font-semibold uppercase tracking-wide"
                onClick={() => setDialogoDomicilio(true)}
              >
                <Bike className="size-4" />
                Nuevo domicilio
              </Button>
              <Button
                className="btn-heat h-11 gap-2 px-5 font-heading text-sm font-semibold uppercase tracking-wide"
                onClick={() => setDialogoNuevo(true)}
              >
                <Plus className="size-4" />
                Nuevo pedido
              </Button>
            </div>
          </div>
        </header>

        <div className="mt-10 space-y-10">
          {domiciliosAbiertos.length > 0 ? (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
                <Bike className="size-4 text-primary" />
                Domicilios · {domiciliosAbiertos.length} {domiciliosAbiertos.length === 1 ? 'activo' : 'activos'}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {domiciliosAbiertos.map((pedido) => (
                  <li key={pedido.id_pedido}>
                    <TarjetaDomicilio
                      pedido={pedido}
                      onClick={() =>
                        void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(() => {
            // Indice global para escalonar la aparicion de las tarjetas al
            // cargar (una sola vez, y solo si el usuario permite movimiento).
            let indiceTarjeta = 0
            return [...zonas.values()].map(({ zona, mesas: mesasZona }) => (
              <section key={zona.id_zona}>
                <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {zona.identificador_zona} · {zona.nombre_zona}
                </h2>

                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {mesasZona.map((mesa) => {
                    const retraso = Math.min(indiceTarjeta++ * 18, 360)
                    return (
                      <li
                        key={mesa.id_mesa}
                        // `group`: el hover se detecta en el li (estacionario),
                        // no en el boton que se levanta. Evita el bucle de
                        // hover cuando el cursor queda en el borde inferior.
                        className="group duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both"
                        style={{ animationDelay: `${retraso}ms` }}
                      >
                        <TarjetaMesa
                          mesa={mesa}
                          pedido={pedidoPorMesa.get(mesa.id_mesa)}
                          disabled={abrirPedido.isPending}
                          abriendo={abrirPedido.isPending && abrirPedido.variables === mesa.id_mesa}
                          onClick={() => alTocarMesa(mesa)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          })()}
        </div>
      </div>

      {/* Pipeline de despacho: solo lectura, solo en desktop. La propia aside
          es el contenedor scrollable (barra fina en su borde derecho). */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto scrollbar-fina border-l border-border bg-surface-lowest xl:block">
        <div className="flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <p className="micro-label">Pipeline activo</p>
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="micro-label text-primary">En vivo</span>
            </span>
          </div>

          {pipeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sin comandas pendientes por entregar.</p>
          ) : (
            pipeline.map(({ pedido, pendientes }) => (
              <article
                key={pedido.id_pedido}
                className="rounded-xl border-b-4 border-primary bg-surface-high p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-lg font-semibold tracking-tight">
                      {pedido.mesa
                        ? `Mesa ${pedido.mesa.numero_mesa}`
                        : `Domicilio · ${pedido.nombre_cliente_pedido ?? 'Cliente'}`}
                    </p>
                    <p className="micro-label mt-0.5">
                      Pedido #{pedido.id_pedido} · {tiempoTranscurrido(pedido.fecha_pedido)}
                    </p>
                  </div>
                  <Badge className="bg-primary/15 text-primary">En preparacion</Badge>
                </div>
                <ul className="mt-3 space-y-1">
                  {pendientes.map((it, i) => (
                    <li key={i} className="text-sm">
                      <span className="tabular-nums text-muted-foreground">{it.cantidad}x</span>{' '}
                      {it.nombre}
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      </aside>

      <Dialog open={dialogoNuevo} onOpenChange={setDialogoNuevo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Nuevo pedido</DialogTitle>
            <DialogDescription>Elige una mesa libre para abrir el pedido.</DialogDescription>
          </DialogHeader>
          {mesasLibres.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No hay mesas libres en este momento.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {mesasLibres.map((mesa) => (
                <button
                  key={mesa.id_mesa}
                  type="button"
                  disabled={abrirPedido.isPending}
                  onClick={() => {
                    setDialogoNuevo(false)
                    alTocarMesa(mesa)
                  }}
                  className="flex flex-col items-center rounded-lg border-b-4 border-secondary bg-surface-high py-3 transition-transform duration-150 ease-out-quart hover:-translate-y-1 hover:border-primary/60 active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="font-heading text-xl font-semibold tabular-nums tracking-tighter">
                    {mesa.numero_mesa}
                  </span>
                  {mesa.zona ? (
                    <span className="micro-label mt-0.5">{mesa.zona.identificador_zona}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DomicilioFormDialog abierto={dialogoDomicilio} onCerrar={() => setDialogoDomicilio(false)} />
    </div>
  )
}

function Leyenda() {
  const items: { etiqueta: string; punto: string }[] = [
    { etiqueta: 'Disponible', punto: 'bg-secondary' },
    { etiqueta: 'Ocupada', punto: 'bg-primary' },
    { etiqueta: 'Atencion', punto: 'bg-destructive' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.etiqueta} className="micro-label flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', it.punto)} />
          {it.etiqueta}
        </span>
      ))}
    </div>
  )
}

function TarjetaMesa({
  mesa,
  pedido,
  disabled,
  abriendo,
  onClick,
}: {
  mesa: Mesa
  pedido: Pedido | undefined
  disabled: boolean
  abriendo: boolean
  onClick: () => void
}) {
  const { vista, etiqueta } = vistaDeMesa(mesa, pedido)
  const Icono = ICONO[vista]
  const inactiva = vista === 'DESACTIVADA'
  const conPedido = (vista === 'OCUPADA' || vista === 'ATENCION') && pedido

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactiva || disabled}
      aria-busy={abriendo}
      className={cn(
        // Solo se anima transform/box-shadow; feedback tactil al presionar.
        'flex h-full w-full flex-col rounded-xl border-b-4 bg-surface-high p-4 text-left transition-[transform,box-shadow] duration-150 ease-out-quart',
        BORDE[vista],
        inactiva
          ? 'cursor-not-allowed opacity-40'
          : 'group-hover:-translate-y-1 group-hover:shadow-[0_12px_28px_-14px_rgb(0_0_0_/_0.7)] active:scale-[0.98] active:translate-y-0 active:shadow-none',
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'font-heading text-4xl font-semibold tabular-nums leading-none tracking-tighter',
            COLOR_NUMERO[vista],
          )}
        >
          {mesa.numero_mesa}
        </span>
        {abriendo ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : (
          <Icono
            className={cn(
              'size-5',
              COLOR_ETIQUETA[vista],
              // Latido tenue solo cuando la mesa pide atencion (estado real).
              vista === 'ATENCION' && 'motion-safe:animate-pulse',
            )}
          />
        )}
      </div>

      {mesa.capacidad_mesa ? (
        <p className="micro-label mt-3">{mesa.capacidad_mesa} plazas</p>
      ) : (
        <div className="mt-3 h-[1em]" />
      )}

      <p className={cn('mt-1.5 text-xs font-semibold uppercase tracking-wide', COLOR_ETIQUETA[vista])}>
        {abriendo ? 'Abriendo…' : etiqueta}
      </p>
      {conPedido && !abriendo ? (
        <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
          {formatearPrecio(totalPedido(pedido))}
          <span className="text-muted-foreground"> · {tiempoTranscurrido(pedido.fecha_pedido)}</span>
        </p>
      ) : null}
    </button>
  )
}

// Tarjeta de un domicilio abierto: el domicilio no vive en el mapa de mesas,
// asi que se lista aparte con los datos de entrega y su estado.
function TarjetaDomicilio({ pedido, onClick }: { pedido: Pedido; onClick: () => void }) {
  const porCobrar = pedido.estado_pedido === 'ENTREGADO'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full w-full flex-col rounded-xl border-b-4 bg-surface-high p-4 text-left transition-[transform,box-shadow] duration-150 ease-out-quart',
        'hover:-translate-y-1 hover:shadow-[0_12px_28px_-14px_rgb(0_0_0_/_0.7)] active:scale-[0.98]',
        porCobrar ? 'border-destructive' : 'border-tertiary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Bike className={cn('size-4 shrink-0', porCobrar ? 'text-destructive' : 'text-tertiary')} />
          <span className="truncate font-heading text-lg font-semibold tracking-tight">
            {pedido.nombre_cliente_pedido ?? 'Cliente'}
          </span>
        </span>
        <Badge className={cn(porCobrar ? 'bg-destructive/15 text-destructive' : 'bg-tertiary/15 text-tertiary')}>
          {porCobrar ? 'Por cobrar' : 'En preparacion'}
        </Badge>
      </div>

      {pedido.telefono_cliente_pedido ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3 shrink-0" /> <span className="tabular-nums">{pedido.telefono_cliente_pedido}</span>
        </p>
      ) : null}
      {pedido.direccion_cliente_pedido ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{pedido.direccion_cliente_pedido}</p>
      ) : null}

      <p className="mt-3 text-sm font-medium tabular-nums text-foreground">
        {formatearPrecio(totalPedido(pedido))}
        <span className="text-muted-foreground"> · {tiempoTranscurrido(pedido.fecha_pedido)}</span>
      </p>
    </button>
  )
}

// Esqueleto con la forma real de la parrilla mientras cargan mesas/pedidos.
function SalonSkeleton() {
  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 p-6 motion-safe:animate-pulse md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded bg-surface-high" />
            <div className="h-11 w-44 rounded-lg bg-surface-high" />
            <div className="h-3 w-56 rounded bg-surface-high" />
          </div>
          <div className="h-11 w-40 rounded-lg bg-surface-high" />
        </div>

        <div className="mt-10 space-y-10">
          {[0, 1].map((z) => (
            <div key={z}>
              <div className="mb-4 h-3 w-40 rounded bg-surface-high" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[8.5rem] rounded-xl border-b-4 border-surface bg-surface-high"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
