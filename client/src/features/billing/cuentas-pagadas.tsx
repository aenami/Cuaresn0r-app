import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Banknote,
  ChevronDown,
  Coins,
  CreditCard,
  Layers3,
  Receipt,
  ReceiptText,
  TrendingUp,
} from 'lucide-react'
import type { CuentaPagada, MetodoPago } from '@/types/api'
import { formatearPrecio } from '@/lib/formato'
import { cuentasPagadasQuery } from '@/features/billing/api'
import { FacturaPreviewDialog } from '@/features/billing/factura-preview'
import { cn } from '@/lib/utils'
import { horaCorta } from './caja-comun'
import { FilaResumen, KpiCard } from './caja-kpis'
import { Button } from '@/components/ui/button'

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

const ICONO_METODO: Record<MetodoPago, typeof Banknote> = {
  EFECTIVO: Banknote,
  TARJETA: CreditCard,
  TRANSFERENCIA: ArrowLeftRight,
}

function cantidadFacturada(cantidad: number, proporcion: string) {
  const valor = cantidad * Number(proporcion)
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2)
}

export function CuentasPagadas() {
  const [dia, setDia] = useState(() => ymdLocal(new Date()))
  const rango = useMemo(() => rangoDia(dia), [dia])
  const { data: cuentas, isPending } = useQuery(cuentasPagadasQuery(rango.desde, rango.hasta))
  const [facturaPreview, setFacturaPreview] = useState<CuentaPagada | null>(null)
  const [separarPorTurno, setSepararPorTurno] = useState(false)

  const fechaLarga = fechaDia(dia).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const totalCobrado = (cuentas ?? []).reduce((acc, c) => acc + Number(c.total), 0)
  const propina = (cuentas ?? []).reduce((acc, c) => acc + Number(c.servicio), 0)
  const gruposPorTurno = useMemo(() => {
    const grupos = new Map<number, { turno: CuentaPagada['turno']; cuentas: CuentaPagada[] }>()
    for (const cuenta of cuentas ?? []) {
      const grupo = grupos.get(cuenta.turno.id)
      if (grupo) grupo.cuentas.push(cuenta)
      else grupos.set(cuenta.turno.id, { turno: cuenta.turno, cuentas: [cuenta] })
    }
    return [...grupos.values()].sort(
      (a, b) => new Date(b.turno.apertura).getTime() - new Date(a.turno.apertura).getTime(),
    )
  }, [cuentas])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-semibold uppercase tracking-tight md:text-5xl">
            Cuentas<span className="text-primary">_</span>Cobradas
          </h1>
          <p className="micro-label mt-2 first-letter:uppercase">Ventas del dia · {fechaLarga}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant={separarPorTurno ? 'default' : 'outline'}
            aria-pressed={separarPorTurno}
            onClick={() => setSepararPorTurno((actual) => !actual)}
          >
            <Layers3 className="size-4" /> Separar por turno
          </Button>
          <SelectorDia dia={dia} onCambiar={setDia} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icono={Receipt}
          titulo="Cuentas cobradas"
          valor={String(cuentas?.length ?? 0)}
          sub="Facturas pagadas del dia"
          acento="border-b-2 border-primary"
        />
        <KpiCard
          icono={TrendingUp}
          titulo="Total cobrado"
          valor={formatearPrecio(totalCobrado)}
          sub="Suma de las cuentas del dia"
          acento="border-b-2 border-tertiary"
        />
        <KpiCard
          icono={Coins}
          titulo="Propina recaudada"
          valor={formatearPrecio(propina)}
          sub="Servicio incluido en las cuentas"
          acento="border-b-2 border-border"
        />
      </div>

      {isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-high" />
          ))}
        </div>
      ) : (cuentas ?? []).length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-center">
          <Receipt className="size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No se cobraron cuentas este dia.</p>
        </div>
      ) : separarPorTurno ? (
        <div className="space-y-7">
          {gruposPorTurno.map((grupo) => (
            <section key={grupo.turno.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="micro-label text-primary">
                    Turno #{grupo.turno.id} · {grupo.turno.caja}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {grupo.turno.cajero ?? 'Cajero no disponible'} · apertura {horaCorta(grupo.turno.apertura)}
                    {grupo.turno.cierre ? ` · cierre ${horaCorta(grupo.turno.cierre)}` : ' · turno abierto'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-xl font-semibold tabular-nums text-primary">
                    {formatearPrecio(grupo.cuentas.reduce((total, cuenta) => total + Number(cuenta.total), 0))}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {grupo.cuentas.length} {grupo.cuentas.length === 1 ? 'cuenta' : 'cuentas'}
                  </p>
                </div>
              </div>
              <ListaCuentas cuentas={grupo.cuentas} onFactura={setFacturaPreview} />
            </section>
          ))}
        </div>
      ) : (
        <ListaCuentas cuentas={cuentas ?? []} onFactura={setFacturaPreview} />
      )}

      {facturaPreview ? (
        <FacturaPreviewDialog cuenta={facturaPreview} abierto onCerrar={() => setFacturaPreview(null)} />
      ) : null}
    </div>
  )
}

function ListaCuentas({ cuentas, onFactura }: { cuentas: CuentaPagada[]; onFactura: (cuenta: CuentaPagada) => void }) {
  return (
    <ul className="space-y-3">
      {cuentas.map((cuenta) => (
        <li key={cuenta.id_factura}>
          <TarjetaCuentaPagada cuenta={cuenta} onFactura={onFactura} />
        </li>
      ))}
    </ul>
  )
}

// dia como 'YYYY-MM-DD' local (para el <input type="date"> y la clave del query).
function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fechaDia(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Rango [00:00, 23:59:59.999] local del dia, en ISO, para el backend.
function rangoDia(ymd: string): { desde: string; hasta: string } {
  const desde = fechaDia(ymd)
  desde.setHours(0, 0, 0, 0)
  const hasta = fechaDia(ymd)
  hasta.setHours(23, 59, 59, 999)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

function SelectorDia({ dia, onCambiar }: { dia: string; onCambiar: (v: string) => void }) {
  const hoy = ymdLocal(new Date())
  const ayer = ymdLocal(new Date(Date.now() - 86_400_000))
  return (
    <div className="flex items-center gap-1.5">
      <BotonDia activo={dia === hoy} onClick={() => onCambiar(hoy)}>
        Hoy
      </BotonDia>
      <BotonDia activo={dia === ayer} onClick={() => onCambiar(ayer)}>
        Ayer
      </BotonDia>
      <input
        type="date"
        value={dia}
        max={hoy}
        onChange={(e) => e.target.value && onCambiar(e.target.value)}
        className="rounded-md border border-border bg-surface-high px-2.5 py-1.5 text-sm text-foreground [color-scheme:dark]"
      />
    </div>
  )
}

function BotonDia({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        activo ? 'bg-primary text-primary-foreground' : 'bg-surface-high text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function TarjetaCuentaPagada({ cuenta, onFactura }: { cuenta: CuentaPagada; onFactura: (c: CuentaPagada) => void }) {
  const [abierto, setAbierto] = useState(false)

  // Metodos distintos usados (una cuenta puede pagarse mixta).
  const metodos = [...new Set(cuenta.pagos.map((p) => p.metodo))]
  const subtotal = Number(cuenta.subtotal)
  const servicio = Number(cuenta.servicio)
  const impuestos = Number(cuenta.impuestos)

  return (
    <section className="overflow-hidden rounded-xl border-l-2 border-primary bg-surface-high">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors duration-150 ease-out-quart hover:bg-surface-high/60 md:p-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10">
            <Receipt className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold tracking-tight">
              {cuenta.pedido.tipo === 'DOMICILIO'
                ? `Domicilio${cuenta.pedido.cliente?.nombre ? ` · ${cuenta.pedido.cliente.nombre}` : ''}`
                : cuenta.pedido.ficha_numero
                  ? `Ficha ${cuenta.pedido.ficha_numero}`
                  : 'Pedido sin ficha'}
              {cuenta.nombre_cuenta ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{cuenta.nombre_cuenta}</span>
              ) : null}
            </p>
            <p className="micro-label mt-0.5 truncate">
              Pedido #{cuenta.pedido.id_pedido} · {horaCorta(cuenta.fecha)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex">
            {metodos.map((m) => (
              <MetodoChip key={m} metodo={m} />
            ))}
          </div>
          <span className="font-heading text-lg font-semibold tabular-nums text-primary">
            {formatearPrecio(cuenta.total)}
          </span>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200 ease-out-quart',
              abierto && 'rotate-180',
            )}
          />
        </div>
      </button>

      {abierto ? (
        <div className="border-t border-border/60 p-4 duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 md:p-5">
          {/* Productos consumidos */}
          <p className="micro-label">Detalle</p>
          <ul className="mt-2 space-y-2">
            {cuenta.items.map((item) => (
              <li key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm">
                    <span className="tabular-nums text-muted-foreground">
                      {cantidadFacturada(item.cantidad, item.proporcion)}×
                    </span>{' '}
                    {item.nombre}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">{formatearPrecio(item.subtotal)}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Totales */}
          <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-sm">
            <FilaResumen etiqueta="Subtotal" valor={subtotal} />
            {servicio > 0 ? <FilaResumen etiqueta="Propina" valor={servicio} /> : null}
            {impuestos > 0 ? <FilaResumen etiqueta="Impuestos" valor={impuestos} /> : null}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums text-primary">{formatearPrecio(cuenta.total)}</span>
            </div>
          </div>

          {/* Pagos */}
          <p className="micro-label mt-4">Pagos</p>
          <ul className="mt-2 space-y-1.5">
            {cuenta.pagos.map((p, i) => {
              const Icono = ICONO_METODO[p.metodo]
              return (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icono className="size-3.5" /> {ETIQUETA_METODO[p.metodo]}
                    <span className="text-xs">· {horaCorta(p.fecha)}</span>
                  </span>
                  <span className="tabular-nums">{formatearPrecio(p.monto)}</span>
                </li>
              )
            })}
            {/* Excedente voluntario ("quedese con el vuelto"): aparte del total. */}
            {cuenta.pagos.map((p, i) =>
              Number(p.excedente) > 0 ? (
                <li key={`exc-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-tertiary">
                    <Coins className="size-3.5" /> Excedente {p.destino === 'PROPINA' ? '(propina meseros)' : '(casa)'}
                  </span>
                  <span className="tabular-nums text-tertiary">{formatearPrecio(p.excedente)}</span>
                </li>
              ) : null,
            )}
          </ul>

          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onFactura(cuenta)}>
              <ReceiptText className="size-4" /> Imprimir factura
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MetodoChip({ metodo }: { metodo: MetodoPago }) {
  const Icono = ICONO_METODO[metodo]
  return (
    <span className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      <Icono className="size-3" /> {ETIQUETA_METODO[metodo]}
    </span>
  )
}
