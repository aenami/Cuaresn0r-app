import { useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bike,
  Coins,
  CreditCard,
  Receipt,
  Utensils,
} from 'lucide-react'
import { PRESETS, reporteQuery, rangoDePreset, rangoPersonalizado } from '@/features/reportes/api'
import type { PresetRango } from '@/features/reportes/api'
import {
  AreaVentasDia,
  BarrasCategoria,
  BarrasDomiciliosDia,
  BarrasVentasHora,
  DonutMetodos,
} from '@/features/reportes/graficas'
import { COLOR_METODO, NOMBRE_METODO } from '@/features/reportes/paleta'
import type { ReporteResumen } from '@/types/api'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

export function DashboardReportes() {
  const [area, setArea] = useState<'RESTAURANTE' | 'PANADERIA'>('RESTAURANTE')
  const [preset, setPreset] = useState<PresetRango | 'personalizado'>('7dias')
  const [custom, setCustom] = useState<{ desde: string; hasta: string }>({ desde: '', hasta: '' })

  const rango = useMemo(() => {
    if (preset === 'personalizado' && custom.desde && custom.hasta) {
      return rangoPersonalizado(custom.desde, custom.hasta)
    }
    if (preset === 'personalizado') return rangoDePreset('7dias')
    return rangoDePreset(preset)
  }, [preset, custom])

  const { data, isPending, isError } = useQuery(reporteQuery(rango.desde, rango.hasta, area))

  return (
    <div className="p-6 md:p-10">
      {/* Encabezado + control de rango */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="micro-label mb-2 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Panel · analitica
          </p>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Reportes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatearFecha(rango.desde)} — {formatearFecha(rango.hasta)}
          </p>
        </div>

        <div>
          <div role="group" aria-label="Área de los reportes" className="mb-3 flex gap-1 rounded-lg bg-surface-lowest p-1">
            {(['RESTAURANTE', 'PANADERIA'] as const).map((opcion) => <button key={opcion} type="button" aria-pressed={area === opcion} onClick={() => setArea(opcion)}
              className={cn('min-h-10 flex-1 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary', area === opcion ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-high hover:text-foreground')}>
              {opcion === 'RESTAURANTE' ? 'Restaurante' : 'Panadería'}
            </button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <BotonPreset key={p.id} activo={preset === p.id} onClick={() => setPreset(p.id)}>
                {p.etiqueta}
              </BotonPreset>
            ))}
            <BotonPreset
              activo={preset === 'personalizado'}
              onClick={() => setPreset('personalizado')}
            >
              Personalizado
            </BotonPreset>
          </div>
          {preset === 'personalizado' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={custom.desde}
                max={custom.hasta || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, desde: e.target.value }))}
                className="rounded-md border border-border bg-surface-high px-2.5 py-1.5 text-sm text-foreground [color-scheme:dark]"
              />
              <span className="text-muted-foreground">—</span>
              <input
                type="date"
                value={custom.hasta}
                min={custom.desde || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, hasta: e.target.value }))}
                className="rounded-md border border-border bg-surface-high px-2.5 py-1.5 text-sm text-foreground [color-scheme:dark]"
              />
            </div>
          )}
        </div>
      </div>

      {isError ? (
        <p className="mt-10 text-sm text-destructive">No se pudieron cargar los reportes.</p>
      ) : isPending || !data ? (
        <p className="mt-10 text-sm text-muted-foreground">Cargando reportes…</p>
      ) : (
        <Contenido data={data} area={area} />
      )}
    </div>
  )
}

function Contenido({ data, area }: { data: ReporteResumen; area: 'RESTAURANTE' | 'PANADERIA' }) {
  const { ventas } = data
  const sinVentas = ventas.cuentas === 0

  return (
    <>
      {/* KPIs */}
      <div className={cn('mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3', area === 'RESTAURANTE' ? 'lg:grid-cols-6' : 'lg:grid-cols-4')}>
        <Kpi etiqueta="Ventas netas" valor={formatearPrecio(ventas.netas)} delta={ventas.delta.netas} icono={Coins} />
        <Kpi etiqueta={area === 'PANADERIA' ? 'Ventas cobradas' : 'Cuentas pagadas'} valor={String(ventas.cuentas)} delta={ventas.delta.cuentas} icono={Receipt} />
        <Kpi
          etiqueta="Ticket promedio"
          valor={formatearPrecio(ventas.ticketPromedio)}
          delta={ventas.delta.ticketPromedio}
          icono={BarChart3}
        />
        <Kpi etiqueta="Items vendidos" valor={String(ventas.items)} delta={ventas.delta.items} icono={Utensils} />
        {area === 'RESTAURANTE' && <><Kpi etiqueta="Domicilios" valor={String(ventas.domicilios)} delta={ventas.delta.domicilios} icono={Bike} />
        <Kpi etiqueta="Propina/servicio" valor={formatearPrecio(ventas.propina)} delta={ventas.delta.propina} icono={CreditCard} /></>}
      </div>

      {sinVentas ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
          <p className="font-heading text-lg font-semibold">Sin ventas en este periodo</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {area === 'PANADERIA' ? 'No hay ventas de panadería en el rango seleccionado. Prueba otro periodo.' : 'No hay cuentas pagadas en el rango seleccionado. Prueba otro periodo.'}
          </p>
        </div>
      ) : (
        <>
          {/* Fila: ventas por dia + metodos de pago */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TarjetaGrafica titulo="Ventas por dia" className="lg:col-span-2">
              <div className="h-72">
                <AreaVentasDia datos={data.porDia} />
              </div>
            </TarjetaGrafica>
            <TarjetaGrafica titulo="Metodos de pago">
              <div className="h-44">
                <DonutMetodos datos={data.metodosPago} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {data.metodosPago.map((m) => (
                  <li key={m.metodo} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2.5 rounded-sm" style={{ background: COLOR_METODO[m.metodo] }} />
                      {NOMBRE_METODO[m.metodo]}
                    </span>
                    <span className="font-medium tabular-nums">{formatearPrecio(m.monto)}</span>
                  </li>
                ))}
              </ul>
            </TarjetaGrafica>
          </div>

          {/* Fila: ventas por hora + categorias */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TarjetaGrafica titulo="Ventas por hora" className="lg:col-span-2">
              <div className="h-64">
                <BarrasVentasHora datos={data.porHora} />
              </div>
            </TarjetaGrafica>
            <TarjetaGrafica titulo="Ingresos por categoria">
              {data.porCategoria.length === 0 ? (
                <SinDatos />
              ) : (
                <div className="h-64">
                  <BarrasCategoria datos={data.porCategoria} />
                </div>
              )}
            </TarjetaGrafica>
          </div>

          {/* Fila: domicilios por dia */}
          {area === 'RESTAURANTE' && <div className="mt-4">
            <TarjetaGrafica titulo="Domicilios por dia">
              <div className="h-56">
                <BarrasDomiciliosDia datos={data.porDia} />
              </div>
            </TarjetaGrafica>
          </div>}

          {/* Fila: top productos + meseros */}
          <div className={cn('mt-4 grid grid-cols-1 gap-4', area === 'RESTAURANTE' && 'lg:grid-cols-2')}>
            <TarjetaGrafica titulo="Top productos">
              {data.topProductos.length === 0 ? (
                <SinDatos />
              ) : (
                <ol className="space-y-2">
                  {data.topProductos.map((p, i) => (
                    <li key={p.nombre + i} className="flex items-center gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-high text-xs font-bold text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{p.unidades} u</span>
                      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {formatearPrecio(p.ingresos)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </TarjetaGrafica>

            {area === 'RESTAURANTE' && <TarjetaGrafica titulo="Ventas por mesero">
              {data.porMesero.length === 0 ? (
                <SinDatos />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="micro-label pb-2 font-medium">Mesero</th>
                        <th className="micro-label pb-2 text-right font-medium">Pedidos</th>
                        <th className="micro-label pb-2 text-right font-medium">Ticket prom.</th>
                        <th className="micro-label pb-2 text-right font-medium">Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.porMesero.map((m, i) => (
                        <tr key={m.mesero + i} className="border-t border-border">
                          <td className="py-2 font-medium">{m.mesero}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{m.pedidos}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {formatearPrecio(m.ticketPromedio)}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">{formatearPrecio(m.ventas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TarjetaGrafica>}
          </div>

          {/* Fila: ventas por ficha + disponibilidad actual */}
          {area === 'RESTAURANTE' && <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TarjetaGrafica titulo="Ventas por ficha">
              {data.porFicha.length === 0 ? (
                <SinDatos />
              ) : (
                <ul className="space-y-2.5">
                  {data.porFicha.map((f, i) => (
                    <BarraFicha key={f.ficha + i} nombre={f.ficha} valor={f.ventas} maximo={data.porFicha[0].ventas} cuentas={f.cuentas} />
                  ))}
                </ul>
              )}
            </TarjetaGrafica>

            <TarjetaGrafica titulo="Estado de fichas" sufijoTitulo="ahora">
              <div className="grid grid-cols-3 gap-3">
                <TileFicha etiqueta="Disponibles" valor={data.ocupacionFichas.DISPONIBLES} acento="muted" />
                <TileFicha etiqueta="En uso" valor={data.ocupacionFichas.OCUPADAS} acento="primary" />
                <TileFicha etiqueta="Inactivas" valor={data.ocupacionFichas.DESACTIVADAS} acento="tertiary" />
              </div>
            </TarjetaGrafica>
          </div>}
        </>
      )}
    </>
  )
}

function BotonPreset({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        activo
          ? 'bg-primary text-primary-foreground'
          : 'bg-surface-high text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Kpi({
  etiqueta,
  valor,
  delta,
  icono: Icono,
}: {
  etiqueta: string
  valor: string
  delta: number | null
  icono: ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-low p-4">
      <div className="flex items-center justify-between">
        <p className="micro-label">{etiqueta}</p>
        <Icono className="size-4 text-muted-foreground/60" />
      </div>
      <p className="mt-2 font-heading text-lg font-bold tabular-nums sm:text-2xl">{valor}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <DeltaBadge valor={delta} />
        <span className="text-[11px] text-muted-foreground">vs. anterior</span>
      </div>
    </div>
  )
}

function DeltaBadge({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-[11px] text-muted-foreground">—</span>
  const positivo = valor >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
        positivo ? 'text-primary' : 'text-destructive',
      )}
    >
      {positivo ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(valor).toFixed(1)}%
    </span>
  )
}

function TarjetaGrafica({
  titulo,
  sufijoTitulo,
  className,
  children,
}: {
  titulo: string
  sufijoTitulo?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface-low p-5', className)}>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide">{titulo}</h2>
        {sufijoTitulo ? <span className="micro-label">{sufijoTitulo}</span> : null}
      </div>
      {children}
    </div>
  )
}

function SinDatos() {
  return <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en este periodo</p>
}

function BarraFicha({
  nombre,
  valor,
  maximo,
  cuentas,
}: {
  nombre: string
  valor: number
  maximo: number
  cuentas: number
}) {
  const pct = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0
  return (
    <li>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{nombre}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatearPrecio(valor)} <span className="text-xs">· {cuentas} ctas</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-high">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

function TileFicha({
  etiqueta,
  valor,
  acento,
}: {
  etiqueta: string
  valor: number
  acento: 'primary' | 'tertiary' | 'muted'
}) {
  const color =
    acento === 'primary' ? 'text-primary' : acento === 'tertiary' ? 'text-tertiary' : 'text-muted-foreground'
  return (
    <div className="rounded-lg bg-surface-high p-4 text-center">
      <p className={cn('font-heading text-3xl font-bold tabular-nums', color)}>{valor}</p>
      <p className="micro-label mt-1">{etiqueta}</p>
    </div>
  )
}
