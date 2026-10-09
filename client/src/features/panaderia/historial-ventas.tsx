import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Banknote,
  ChevronDown,
  Layers3,
  Printer,
  Receipt,
  TrendingUp,
} from 'lucide-react'
import { ventasPorFechaQuery } from './api'
import type { VentaPanaderia } from './api'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'
import { horaCorta } from '@/features/billing/caja-comun'
import { KpiCard } from '@/features/billing/caja-kpis'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const METODOS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
}
function diaColombia(fecha = new Date()) {
  return new Date(fecha.getTime() - 5 * 3600000).toISOString().slice(0, 10)
}
function cajero(venta: VentaPanaderia) {
  const usuario = venta.turno?.usuario
  return usuario?.empleado
    ? `${usuario.empleado.nombre_empleado} ${usuario.empleado.apellido_empleado}`
    : (usuario?.email_usuario ?? 'Cajero no disponible')
}

export function HistorialVentasPanaderia() {
  const [dia, setDia] = useState(diaColombia)
  const [separar, setSeparar] = useState(false)
  const [recibo, setRecibo] = useState<VentaPanaderia | null>(null)
  const {
    data: ventas = [],
    isPending,
    isError,
    refetch,
  } = useQuery(ventasPorFechaQuery(dia))
  const total = ventas.reduce((suma, venta) => suma + Number(venta.total), 0)
  const efectivo = ventas.reduce(
    (suma, venta) =>
      suma +
      venta.pagos
        .filter((p) => p.metodo === 'EFECTIVO')
        .reduce((subtotal, p) => subtotal + Number(p.monto), 0),
    0,
  )
  const grupos = new Map<number, VentaPanaderia[]>()
  for (const venta of ventas) {
    const grupo = grupos.get(venta.turnoId)
    if (grupo) grupo.push(venta)
    else grupos.set(venta.turnoId, [venta])
  }
  const hoy = diaColombia()
  const ayer = diaColombia(new Date(Date.now() - 86400000))

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-tight md:text-4xl">
            Cuentas<span className="text-primary">_</span>Cobradas
          </h1>
          <p className="micro-label mt-2">
            Panadería ·{' '}
            {new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CO', {
              dateStyle: 'full',
              timeZone: 'America/Bogota',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={separar ? 'default' : 'outline'}
            aria-pressed={separar}
            onClick={() => setSeparar(!separar)}
          >
            <Layers3 className="size-4" /> Separar por turno
          </Button>
          <Button
            type="button"
            size="sm"
            variant={dia === hoy ? 'default' : 'secondary'}
            onClick={() => setDia(hoy)}
          >
            Hoy
          </Button>
          <Button
            type="button"
            size="sm"
            variant={dia === ayer ? 'default' : 'secondary'}
            onClick={() => setDia(ayer)}
          >
            Ayer
          </Button>
          <Input
            type="date"
            aria-label="Fecha de las cuentas cobradas"
            max={hoy}
            value={dia}
            onChange={(evento) => {
              if (evento.target.value) setDia(evento.target.value)
            }}
            className="w-40"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          icono={Receipt}
          titulo="Cuentas cobradas"
          valor={isPending ? '—' : String(ventas.length)}
          sub="Ventas del día"
          acento="border-b-2 border-primary"
        />
        <KpiCard
          icono={TrendingUp}
          titulo="Total cobrado"
          valor={isPending ? '—' : formatearPrecio(total)}
          sub="Todos los métodos de pago"
          acento="border-b-2 border-tertiary"
        />
        <KpiCard
          icono={Banknote}
          titulo="Efectivo recaudado"
          valor={isPending ? '—' : formatearPrecio(efectivo)}
          sub={`Digital: ${formatearPrecio(total - efectivo)}`}
          acento="border-b-2 border-border"
        />
      </div>
      {isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-surface-high" />
      ) : isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">
            No se pudieron consultar las cuentas.
          </p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : ventas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No se cobraron cuentas este día.
        </div>
      ) : separar ? (
        <div className="space-y-7">
          {[...grupos].map(([id, cuentas]) => {
            const turno = cuentas[0].turno
            return (
              <section key={id}>
                <div className="mb-3 flex flex-wrap justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="micro-label text-primary">
                      Turno #{id} · {turno?.caja.nombre_caja ?? 'Panadería'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {cajero(cuentas[0])}
                      {turno
                        ? ` · apertura ${horaCorta(turno.fecha_apertura_turno)}${turno.fecha_cierre_turno ? ` · cierre ${horaCorta(turno.fecha_cierre_turno)}` : ' · turno abierto'}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-xl tabular-nums text-primary">
                      {formatearPrecio(
                        cuentas.reduce(
                          (suma, venta) => suma + Number(venta.total),
                          0,
                        ),
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cuentas.length} cuentas
                    </p>
                  </div>
                </div>
                <ListaVentas ventas={cuentas} onRecibo={setRecibo} />
              </section>
            )
          })}
        </div>
      ) : (
        <ListaVentas ventas={ventas} onRecibo={setRecibo} />
      )}
      {recibo ? (
        <Dialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setRecibo(null)
          }}
        >
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-sm">
            <DialogHeader className="no-print">
              <DialogTitle>Comprobante #{recibo.id}</DialogTitle>
              <DialogDescription>
                Recibo interno de panadería, no factura fiscal. Puedes
                imprimirlo o guardarlo como PDF.
              </DialogDescription>
            </DialogHeader>
            <div className="factura-print rounded-md bg-white p-5 font-mono text-xs text-black">
              <p className="text-center text-sm font-bold">
                PANADERÍA · COMPROBANTE DE VENTA
              </p>
              <p className="mt-3">
                Venta #{recibo.id} · Turno #{recibo.turnoId}
              </p>
              <p>
                {new Date(recibo.fecha).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                })}
              </p>
              <p>Cajero: {cajero(recibo)}</p>
              <ul className="my-4 space-y-2 border-y border-dashed border-gray-400 py-3">
                {recibo.detalles.map((linea) => (
                  <li key={linea.id} className="flex justify-between gap-2">
                    <span>
                      {formatearCantidad(linea.cantidad)} ×{' '}
                      {linea.nombreSnapshot}
                    </span>
                    <span className="shrink-0">
                      {formatearPrecio(linea.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>{formatearPrecio(recibo.total)}</span>
              </p>
              {recibo.pagos.map((pago) => (
                <p key={pago.id} className="mt-2 flex justify-between">
                  <span>{METODOS[pago.metodo]}</span>
                  <span>{formatearPrecio(pago.monto)}</span>
                </p>
              ))}
              <p className="mt-4 text-center">Gracias por tu compra</p>
            </div>
            <Button
              type="button"
              className="no-print"
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> Imprimir / guardar PDF
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

function ListaVentas({
  ventas,
  onRecibo,
}: {
  ventas: VentaPanaderia[]
  onRecibo: (venta: VentaPanaderia) => void
}) {
  return (
    <ul className="space-y-3">
      {ventas.map((venta) => (
        <li key={venta.id}>
          <TarjetaVenta venta={venta} onRecibo={onRecibo} />
        </li>
      ))}
    </ul>
  )
}
function TarjetaVenta({
  venta,
  onRecibo,
}: {
  venta: VentaPanaderia
  onRecibo: (venta: VentaPanaderia) => void
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <section className="overflow-hidden rounded-xl bg-surface-high">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
        aria-expanded={abierta}
        aria-controls={`venta-detalle-${venta.id}`}
        onClick={() => setAbierta(!abierta)}
      >
        <div className="min-w-0">
          <p className="font-heading font-semibold">
            Venta de mostrador #{venta.id}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Turno #{venta.turnoId} · {horaCorta(venta.fecha)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[...new Set(venta.pagos.map((pago) => METODOS[pago.metodo]))].join(
              ' · ',
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <strong className="font-heading text-lg tabular-nums text-primary">
            {formatearPrecio(venta.total)}
          </strong>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground',
              abierta && 'rotate-180',
            )}
          />
        </div>
      </button>
      {abierta ? (
        <div
          id={`venta-detalle-${venta.id}`}
          className="space-y-4 border-t border-border/60 p-4"
        >
          <div>
            <p className="micro-label">Productos</p>
            <ul className="mt-2 space-y-2">
              {venta.detalles.map((linea) => (
                <li
                  key={linea.id}
                  className="flex flex-wrap justify-between gap-2 text-sm"
                >
                  <span>
                    {formatearCantidad(linea.cantidad)} × {linea.nombreSnapshot}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatearPrecio(linea.precioUnitario)} c/u
                    </span>
                  </span>
                  <strong className="tabular-nums">
                    {formatearPrecio(linea.subtotal)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border/60 pt-3">
            <p className="micro-label">Pagos · {cajero(venta)}</p>
            <ul className="mt-2 space-y-2">
              {venta.pagos.map((pago) => (
                <li
                  key={pago.id}
                  className="flex justify-between gap-2 text-sm"
                >
                  <span>{METODOS[pago.metodo]}</span>
                  <span className="tabular-nums">
                    {formatearPrecio(pago.monto)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onRecibo(venta)}
            >
              <Receipt className="size-4" /> Ver comprobante
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
