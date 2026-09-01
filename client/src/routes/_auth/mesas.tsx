import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Bike, CircleAlert, Hash, Loader2, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  fichasQuery,
  pedidosAbiertosQuery,
  useAbrirPedido,
  useActualizarFicha,
  useCrearFicha,
} from '@/features/pedidos/api'
import { DomicilioFormDialog } from '@/features/pedidos/domicilio-form-dialog'
import { useEsAdmin } from '@/stores/auth.store'
import type { Ficha, Pedido } from '@/types/api'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const Route = createFileRoute('/_auth/mesas')({ component: PaginaPedidos })

function totalPedido(pedido: Pedido) {
  return (pedido.comandas ?? [])
    .flatMap((comanda) => comanda.detalles ?? [])
    .filter((detalle) => detalle.estado_dc !== 'CANCELADO')
    .reduce((total, detalle) => total + Number(detalle.precio_unitario_dc) * detalle.cantidad_producto_dc, 0)
}

function minutosDesde(fecha: string) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000))
  return minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`
}

function estadoVisible(pedido: Pedido) {
  if (pedido.estado_pedido === 'ABIERTO') return { texto: 'En espera', color: 'bg-surface-high text-muted-foreground' }
  if (pedido.estado_pedido === 'ENTREGADO') return { texto: 'Saldo pendiente', color: 'bg-destructive/15 text-destructive' }
  return { texto: 'En preparacion', color: 'bg-tertiary/15 text-tertiary' }
}

function PaginaPedidos() {
  const navigate = useNavigate()
  const esAdmin = useEsAdmin()
  const { data: fichas, isPending: cargandoFichas } = useQuery(fichasQuery)
  const { data: pedidos, isPending: cargandoPedidos } = useQuery(pedidosAbiertosQuery)
  const abrir = useAbrirPedido()
  const [domicilioAbierto, setDomicilioAbierto] = useState(false)
  const [gestionAbierta, setGestionAbierta] = useState(false)

  const locales = (pedidos ?? []).filter((pedido) => pedido.tipo_pedido === 'LOCAL')
  const domicilios = (pedidos ?? []).filter((pedido) => pedido.tipo_pedido === 'DOMICILIO')
  const pedidoPorFicha = new Map(locales.filter((pedido) => pedido.id_ficha_pedido !== null).map((pedido) => [pedido.id_ficha_pedido, pedido]))
  const sinFicha = locales.filter((pedido) => pedido.id_ficha_pedido === null)
  const fichasActivas = (fichas ?? []).filter((ficha) => ficha.ficha_activa)

  function abrirLocal() {
    abrir
      .mutateAsync()
      .then((pedido) => {
        toast.success(`Pedido #${pedido.id_pedido} creado sin ficha`)
        void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })
      })
      .catch((error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Error de conexion'))
  }

  if (cargandoFichas || cargandoPedidos) {
    return <p className="p-8 text-sm text-muted-foreground">Cargando operacion del restaurante…</p>
  }

  return (
    <div className="min-h-full p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div>
          <p className="micro-label mb-2">Operacion en vivo</p>
          <h1 className="font-heading text-4xl font-semibold tracking-tighter md:text-5xl">Pedidos y fichas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {locales.length} locales activos · {domicilios.length} domicilios · {sinFicha.length} sin ficha
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdmin ? (
            <Button variant="outline" className="h-11" onClick={() => setGestionAbierta(true)}>
              <Settings2 className="size-4" /> Fichas
            </Button>
          ) : null}
          <Button variant="outline" className="h-11" onClick={() => setDomicilioAbierto(true)}>
            <Bike className="size-4" /> Domicilio
          </Button>
          <Button className="btn-heat h-11" disabled={abrir.isPending} onClick={abrirLocal}>
            {abrir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Nuevo pedido
          </Button>
        </div>
      </header>

      {sinFicha.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-primary/25 bg-primary/[0.04] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="micro-label text-primary">Sin ficha asignada</p>
              <p className="mt-1 text-sm text-muted-foreground">Pedidos tomados en el salon o pendientes de pasar por caja.</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-primary/15 font-heading text-primary">{sinFicha.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sinFicha.map((pedido) => (
              <TarjetaPedido key={pedido.id_pedido} pedido={pedido} onAbrir={() => void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="micro-label">Identificacion fisica</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight">Fichas del local</h2>
          </div>
          <p className="text-xs text-muted-foreground">Se libera al entregar y saldar todo el pedido</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
          {fichasActivas.map((ficha) => {
            const pedido = pedidoPorFicha.get(ficha.id_ficha) ?? undefined
            return <TarjetaFicha key={ficha.id_ficha} ficha={ficha} pedido={pedido} onAbrir={pedido ? () => void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } }) : undefined} />
          })}
        </div>
      </section>

      {domicilios.length > 0 ? (
        <section className="mt-10">
          <p className="micro-label mb-4">Domicilios activos</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {domicilios.map((pedido) => (
              <TarjetaPedido key={pedido.id_pedido} pedido={pedido} domicilio onAbrir={() => void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })} />
            ))}
          </div>
        </section>
      ) : null}

      <DomicilioFormDialog abierto={domicilioAbierto} onCerrar={() => setDomicilioAbierto(false)} />
      {esAdmin ? <GestionFichas abierto={gestionAbierta} fichas={fichas ?? []} onCerrar={() => setGestionAbierta(false)} /> : null}
    </div>
  )
}

function TarjetaFicha({ ficha, pedido, onAbrir }: { ficha: Ficha; pedido?: Pedido; onAbrir?: () => void }) {
  const estado = pedido ? estadoVisible(pedido) : null
  return (
    <button
      type="button"
      disabled={!pedido}
      onClick={onAbrir}
      className={cn(
        'group min-h-40 rounded-xl border-b-4 p-4 text-left transition-[transform,box-shadow] duration-150',
        pedido ? 'border-primary bg-surface-high hover:-translate-y-1 hover:shadow-lg' : 'border-secondary bg-surface-low opacity-65',
      )}
    >
      <div className="flex items-start justify-between">
        <span className={cn('font-heading text-4xl font-semibold tracking-tighter', pedido ? 'text-primary' : 'text-secondary')}>{ficha.numero_ficha}</span>
        <Hash className="size-5 text-muted-foreground" />
      </div>
      {pedido && estado ? (
        <>
          <Badge className={cn('mt-4', estado.color)}>{estado.texto}</Badge>
          <p className="mt-3 font-heading text-base font-semibold tabular-nums">{formatearPrecio(totalPedido(pedido))}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Pedido #{pedido.id_pedido} · {minutosDesde(pedido.fecha_pedido)}</p>
        </>
      ) : (
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-secondary">Disponible</p>
      )}
    </button>
  )
}

function TarjetaPedido({ pedido, domicilio = false, onAbrir }: { pedido: Pedido; domicilio?: boolean; onAbrir: () => void }) {
  const estado = estadoVisible(pedido)
  return (
    <button type="button" onClick={onAbrir} className="rounded-xl border-b-4 border-tertiary bg-surface-high p-4 text-left transition-transform hover:-translate-y-1 active:scale-[0.98]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-heading text-lg font-semibold">
          {domicilio ? <Bike className="size-4 shrink-0 text-tertiary" /> : <CircleAlert className="size-4 shrink-0 text-primary" />}
          <span className="truncate">{domicilio ? pedido.nombre_cliente_pedido ?? 'Domicilio' : `Pedido #${pedido.id_pedido}`}</span>
        </span>
        <Badge className={estado.color}>{estado.texto}</Badge>
      </div>
      <p className="mt-4 font-heading text-lg font-semibold tabular-nums">{formatearPrecio(totalPedido(pedido))}</p>
      <p className="mt-1 text-xs text-muted-foreground">{minutosDesde(pedido.fecha_pedido)} · Pedido #{pedido.id_pedido}</p>
    </button>
  )
}

function GestionFichas({ abierto, fichas, onCerrar }: { abierto: boolean; fichas: Ficha[]; onCerrar: () => void }) {
  const crear = useCrearFicha()
  const actualizar = useActualizarFicha()
  const [numero, setNumero] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [nuevoNumero, setNuevoNumero] = useState('')

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Administrar fichas</DialogTitle>
          <DialogDescription>Crea, renumera o desactiva identificadores fisicos.</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!numero.trim()) return; crear.mutateAsync(numero).then(() => setNumero('')).catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear')) }}>
          <Input value={numero} onChange={(event) => setNumero(event.target.value)} maxLength={10} placeholder="Ej. 01" />
          <Button type="submit" disabled={crear.isPending}>Agregar</Button>
        </form>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {fichas.map((ficha) => (
            <div key={ficha.id_ficha} className="flex items-center gap-2 rounded-lg bg-surface-low p-2.5">
              {editando === ficha.id_ficha ? (
                <Input className="h-8" value={nuevoNumero} onChange={(event) => setNuevoNumero(event.target.value)} />
              ) : (
                <span className="w-20 font-heading text-lg font-semibold">{ficha.numero_ficha}</span>
              )}
              <span className="flex-1 text-xs text-muted-foreground">{ficha.ficha_activa ? (ficha.disponible ? 'Disponible' : 'En uso') : 'Desactivada'}</span>
              {editando === ficha.id_ficha ? (
                <Button size="sm" onClick={() => actualizar.mutateAsync({ id: ficha.id_ficha, numero: nuevoNumero }).then(() => setEditando(null)).catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No se pudo renumerar'))}>Guardar</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => { setEditando(ficha.id_ficha); setNuevoNumero(ficha.numero_ficha) }}>Renumerar</Button>
              )}
              <Button size="sm" variant="ghost" disabled={actualizar.isPending || ficha.pedidoActivo != null} onClick={() => actualizar.mutate({ id: ficha.id_ficha, activa: !ficha.ficha_activa })}>
                {ficha.ficha_activa ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
