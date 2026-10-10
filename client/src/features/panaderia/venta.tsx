import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Minus, Plus, Search, ShoppingBag } from 'lucide-react'
import type { TurnoResumen } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatearPrecio } from '@/lib/formato'
import { errorApi } from '@/features/billing/caja-comun'
import { articulosQuery, bakeryApi, bakeryKeys, ventasQuery } from './api'

export function VentaPanaderia({
  turno,
  onIrCaja,
}: {
  turno: TurnoResumen | null
  onIrCaja: () => void
}) {
  const { data: articulos, isPending, isError } = useQuery(articulosQuery)
  const { data: ventas } = useQuery(ventasQuery)
  const queryClient = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<Record<number, number>>({})
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [tarjeta, setTarjeta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const [recibido, setRecibido] = useState('')
  const buscador = useRef<HTMLInputElement>(null)
  const campoRecibido = useRef<HTMLInputElement>(null)
  const productos = useRef<HTMLDivElement>(null)
  const claveOperacion = useRef<string | null>(null)

  const disponibles = (articulos ?? []).filter(
    (articulo) => articulo.activo && articulo.tipo !== 'INSUMO',
  )
  const normalizar = (valor: string) =>
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-CO')
      .trim()
  const filtrados = disponibles.filter((articulo) =>
    normalizar(articulo.nombre).includes(normalizar(busqueda)),
  )
  const lineas = disponibles.filter((articulo) => carrito[articulo.id] > 0)
  const total = lineas.reduce(
    (suma, articulo) =>
      suma + carrito[articulo.id] * Number(articulo.precioVenta),
    0,
  )
  const valorTransferencia = Number(transferencia || 0)
  const valorTarjeta = Number(tarjeta || 0)
  const valorEfectivo =
    efectivo === ''
      ? Math.max(0, total - valorTransferencia - valorTarjeta)
      : Number(efectivo)
  const sumaPagos = valorEfectivo + valorTransferencia + valorTarjeta
  const pagoValido =
    total > 0 &&
    sumaPagos === total &&
    [valorEfectivo, valorTransferencia, valorTarjeta].every(
      (valor) => Number.isFinite(valor) && valor >= 0,
    )
  const efectivoRecibido = recibido === '' ? valorEfectivo : Number(recibido)
  const devuelta = efectivoRecibido - valorEfectivo
  const recibidoValido =
    valorEfectivo === 0 ||
    (Number.isFinite(efectivoRecibido) && efectivoRecibido >= valorEfectivo)

  function navegarProductos(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      buscador.current?.focus()
      return
    }
    if (
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.key)
    )
      return
    const botones = Array.from(
      productos.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-producto]:not(:disabled)',
      ) ?? [],
    )
    const actual = botones.indexOf(evento.target as HTMLButtonElement)
    if (actual < 0) return
    evento.preventDefault()
    const centro = (boton: HTMLButtonElement) => {
      const rect = boton.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    const origen = centro(botones[actual])
    const vertical = evento.key === 'ArrowDown' || evento.key === 'ArrowUp'
    const signo =
      evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : -1
    const destino = botones
      .map((boton) => {
        const punto = centro(boton)
        const avance =
          (vertical ? punto.y - origen.y : punto.x - origen.x) * signo
        const lateral = Math.abs(
          vertical ? punto.x - origen.x : punto.y - origen.y,
        )
        return {
          boton,
          avance,
          distancia: avance + lateral * (vertical ? 2 : 10),
        }
      })
      .filter((candidato) => candidato.avance > 1)
      .sort((a, b) => a.distancia - b.distancia)[0]?.boton
    destino?.focus()
    destino?.scrollIntoView({ block: 'nearest' })
  }

  function cambiarCantidad(id: number, cambio: number) {
    claveOperacion.current = null
    const maximo = Math.floor(
      Number(
        disponibles.find((articulo) => articulo.id === id)?.disponible ??
          disponibles.find((articulo) => articulo.id === id)?.existencia ??
          0,
      ),
    )
    setCarrito((anterior) => {
      const siguiente = {
        ...anterior,
        [id]: Math.min(maximo, Math.max(0, (anterior[id] ?? 0) + cambio)),
      }
      return siguiente
    })
  }

  async function cobrar() {
    if (!turno || !pagoValido || !recibidoValido || guardando) return
    setGuardando(true)
    try {
      claveOperacion.current ??= crypto.randomUUID()
      const venta = await bakeryApi.venta({
        claveOperacion: claveOperacion.current,
        lineas: lineas.map((articulo) => ({
          articuloId: articulo.id,
          cantidad: carrito[articulo.id],
        })),
        pagos: [
          { metodo: 'EFECTIVO' as const, monto: valorEfectivo },
          { metodo: 'TRANSFERENCIA' as const, monto: valorTransferencia },
          { metodo: 'TARJETA' as const, monto: valorTarjeta },
        ].filter((pago) => pago.monto > 0),
      })
      toast.success(`Venta #${venta.id} registrada`)
      claveOperacion.current = null
      setCarrito({})
      setEfectivo('')
      setTransferencia('')
      setTarjeta('')
      setRecibido('')
      setBusqueda('')
      setCobroAbierto(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bakeryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['billing'] }),
      ])
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
      onKeyDown={(evento) => {
        if (evento.key === 'F2' && turno && total > 0) {
          evento.preventDefault()
          setCobroAbierto(true)
        }
      }}
    >
      <section className="min-w-0 space-y-4" aria-labelledby="venta-productos">
        <div>
          <h2
            id="venta-productos"
            className="font-heading text-xl font-semibold uppercase"
          >
            Mostrador
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecciona panes o bebidas y cobra la venta.
          </p>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={buscador}
            aria-label="Buscar artículo de panadería"
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar artículo"
            className="pl-10"
            onKeyDown={(evento) => {
              if (evento.nativeEvent.isComposing) return
              if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
                evento.preventDefault()
                const botones =
                  productos.current?.querySelectorAll<HTMLButtonElement>(
                    'button[data-producto]:not(:disabled)',
                  )
                const boton =
                  evento.key === 'ArrowUp'
                    ? botones?.[botones.length - 1]
                    : botones?.[0]
                boton?.focus()
              } else if (evento.key === 'Enter') {
                evento.preventDefault()
                productos.current
                  ?.querySelector<HTMLButtonElement>(
                    'button[data-producto]:not(:disabled)',
                  )
                  ?.click()
              }
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          ↓ entrar a productos · Flechas recorrer · Enter agregar · Esc buscar ·
          F2 cobrar
        </p>
        {isPending ? (
          <div className="h-72 animate-pulse rounded-xl bg-surface-high" />
        ) : isError ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          >
            No se pudo cargar el catalogo. Recarga la pagina para reintentar.
          </p>
        ) : filtrados.length === 0 ? (
          <p className="rounded-lg bg-surface-high p-6 text-sm text-muted-foreground">
            {busqueda
              ? 'No hay articulos con ese nombre.'
              : 'No hay articulos activos. Un administrador puede crearlos en Inventario y conteo.'}
          </p>
        ) : (
          <div
            ref={productos}
            onKeyDown={navegarProductos}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filtrados.map((articulo) => (
              <button
                key={articulo.id}
                data-producto={articulo.id}
                type="button"
                onClick={() => cambiarCantidad(articulo.id, 1)}
                disabled={
                  !turno ||
                  Number(articulo.disponible ?? articulo.existencia) < 1
                }
                className="min-h-28 rounded-lg bg-surface-high p-4 text-left transition-colors hover:bg-surface-high/70 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                  {articulo.tipo === 'PANADERIA'
                    ? 'Panadería'
                    : articulo.tipo === 'PASTELERIA'
                      ? 'Pastelería'
                      : 'Externo'}
                </span>
                <span className="mt-2 block font-heading text-base font-semibold">
                  {articulo.nombre}
                </span>
                <span className="mt-3 flex justify-between gap-3 text-sm">
                  <strong className="tabular-nums">
                    {formatearPrecio(articulo.precioVenta)}
                  </strong>
                  <span className="text-muted-foreground">
                    {articulo.disponible ?? articulo.existencia} disponibles
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="pt-3">
          <h3 className="font-heading text-sm font-semibold uppercase">
            Ultimas ventas
          </h3>
          <div className="mt-3 space-y-2">
            {(ventas ?? []).slice(0, 5).map((venta) => (
              <div
                key={venta.id}
                className="flex items-center justify-between gap-3 bg-surface-low px-3 py-2 text-sm"
              >
                <span>
                  #{venta.id} ·{' '}
                  {venta.detalles
                    .map((linea) => linea.nombreSnapshot)
                    .join(', ')}
                </span>
                <strong className="shrink-0 tabular-nums">
                  {formatearPrecio(venta.total)}
                </strong>
              </div>
            ))}
            {ventas?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Las ventas registradas apareceran aqui.
              </p>
            )}
          </div>
        </div>
      </section>

      <aside
        className="h-fit space-y-4 rounded-xl bg-surface-high p-5 xl:sticky xl:top-6"
        aria-labelledby="resumen-venta"
      >
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-5 text-primary" />
          <h2
            id="resumen-venta"
            className="font-heading text-lg font-semibold uppercase"
          >
            Venta actual
          </h2>
        </div>
        {!turno ? (
          <div className="rounded-lg bg-surface-low p-4 text-sm text-muted-foreground">
            Abre un turno de panaderia para cobrar.{' '}
            <Button
              size="sm"
              variant="secondary"
              className="mt-3 w-full"
              onClick={onIrCaja}
            >
              Ir a caja
            </Button>
          </div>
        ) : null}
        {lineas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Agrega articulos desde el mostrador.
          </p>
        ) : (
          <div className="space-y-3">
            {lineas.map((articulo) => (
              <div
                key={articulo.id}
                className="flex items-center justify-between gap-2 border-b border-border/50 pb-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {articulo.nombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearPrecio(articulo.precioVenta)} c/u
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Quitar ${articulo.nombre}`}
                    onClick={() => cambiarCantidad(articulo.id, -1)}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">
                    {carrito[articulo.id]}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Agregar ${articulo.nombre}`}
                    disabled={
                      carrito[articulo.id] >=
                      Number(articulo.disponible ?? articulo.existencia)
                    }
                    onClick={() => cambiarCantidad(articulo.id, 1)}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <strong className="font-heading text-2xl tabular-nums">
            {formatearPrecio(total)}
          </strong>
        </div>
        <Button
          className="btn-heat h-11 w-full"
          disabled={!turno || total === 0 || guardando}
          onClick={() => setCobroAbierto(true)}
        >
          Cobrar {formatearPrecio(total)}{' '}
          <span className="ml-auto text-xs opacity-75">F2</span>
        </Button>
      </aside>
      <Dialog
        open={cobroAbierto}
        onOpenChange={(abierto) => {
          if (!guardando) setCobroAbierto(abierto)
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-md"
          onOpenAutoFocus={(evento) => {
            if (campoRecibido.current) {
              evento.preventDefault()
              campoRecibido.current.focus()
            }
          }}
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            buscador.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cobrar venta de mostrador</DialogTitle>
            <DialogDescription>
              {lineas.length} productos · Total {formatearPrecio(total)}. Enter
              confirma el cobro.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              void cobrar()
            }}
          >
            <fieldset disabled={guardando} className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Pago mixto</p>
                <div>
                  <Label htmlFor="pan-efectivo">Efectivo</Label>
                  <Input
                    id="pan-efectivo"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={efectivo === '' ? valorEfectivo : efectivo}
                    onChange={(e) => {
                      claveOperacion.current = null
                      setEfectivo(e.target.value)
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="pan-transferencia">Transferencia</Label>
                  <Input
                    id="pan-transferencia"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={transferencia}
                    onChange={(e) => {
                      claveOperacion.current = null
                      setTransferencia(e.target.value)
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="pan-tarjeta">Tarjeta</Label>
                  <Input
                    id="pan-tarjeta"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={tarjeta}
                    onChange={(e) => {
                      claveOperacion.current = null
                      setTarjeta(e.target.value)
                    }}
                  />
                </div>
                {!pagoValido && (
                  <p role="status" className="text-xs text-destructive">
                    Los pagos deben sumar exactamente {formatearPrecio(total)}.
                  </p>
                )}
              </div>
              {valorEfectivo > 0 ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <Label htmlFor="pan-recibido">
                      Efectivo que entrega el cliente
                    </Label>
                    <Input
                      ref={campoRecibido}
                      id="pan-recibido"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={recibido}
                      placeholder={String(valorEfectivo)}
                      onChange={(evento) => setRecibido(evento.target.value)}
                      autoFocus
                    />
                  </div>
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-between rounded-lg bg-surface-low p-3"
                  >
                    <span className="text-sm">
                      {recibidoValido
                        ? 'Devuelta al cliente'
                        : 'Efectivo faltante'}
                    </span>
                    <strong
                      className={
                        recibidoValido
                          ? 'text-xl tabular-nums text-emerald-300'
                          : 'text-xl tabular-nums text-destructive'
                      }
                    >
                      {formatearPrecio(Math.abs(devuelta))}
                    </strong>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sin un valor recibido se asume pago exacto. Solo{' '}
                    {formatearPrecio(valorEfectivo)} se registra como ingreso en
                    efectivo.
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={guardando}
                  onClick={() => setCobroAbierto(false)}
                >
                  Volver
                </Button>
                <Button
                  type="submit"
                  className="btn-heat"
                  disabled={
                    !turno || !pagoValido || !recibidoValido || guardando
                  }
                >
                  {guardando
                    ? 'Registrando…'
                    : `Confirmar ${formatearPrecio(total)}`}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
