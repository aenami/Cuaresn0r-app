import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAreaTrabajo } from '@/stores/auth.store'
import { formatearPrecio } from '@/lib/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ResumenValoracionRango } from './valoracion-types'

type Periodo = { desde: string; hasta: string }

function fechaActual() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map(tipo => partes.find(p => p.type === tipo)!.value).join('-')
}

function periodoRapido(tipo: 'hoy' | 'semana' | 'mes'): Periodo {
  const hasta = fechaActual()
  const fecha = new Date(`${hasta}T00:00:00Z`)
  if (tipo === 'semana') fecha.setUTCDate(fecha.getUTCDate() - 6)
  if (tipo === 'mes') fecha.setUTCDate(1)
  return { desde: fecha.toISOString().slice(0, 10), hasta }
}

function errorPeriodo({ desde, hasta }: Periodo) {
  const esFecha = (valor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
    const fecha = new Date(`${valor}T00:00:00Z`)
    return valor >= '2000-01-01' && valor <= '9998-12-31' && Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  }
  if (!esFecha(desde) || !esFecha(hasta)) return 'Completa ambas fechas con un día válido.'
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1
  if (dias < 1) return 'La fecha inicial no puede ser posterior a la final.'
  if (dias > 366) return 'Consulta hasta 366 días por rango.'
  return null
}

function fechaVisible(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T00:00:00Z`))
}

export function ResumenMonetarioPorFechas() {
  const area = useAreaTrabajo()
  const [consulta, setConsulta] = useState<Periodo>(() => periodoRapido('semana'))
  const [borrador, setBorrador] = useState(consulta)
  const [errorFechas, setErrorFechas] = useState<string | null>(null)
  const hoy = fechaActual()
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['inventario', 'valoracion-rango', area, consulta.desde, consulta.hasta],
    queryFn: () => api.get<ResumenValoracionRango>(`/recipes/inventory-valuation/range?from=${consulta.desde}&to=${consulta.hasta}`),
    staleTime: 30_000,
    refetchInterval: consulta.desde <= hoy && consulta.hasta >= hoy ? 30_000 : false,
  })
  const excluidos = data ? Object.values(data.excluidos).reduce((total, cantidad) => total + cantidad, 0) : 0
  const cambioPendiente = borrador.desde !== consulta.desde || borrador.hasta !== consulta.hasta

  function consultar(periodo = borrador) {
    const error = errorPeriodo(periodo)
    setErrorFechas(error)
    if (error) return
    setBorrador(periodo)
    setConsulta(periodo)
    if (periodo.desde === consulta.desde && periodo.hasta === consulta.hasta) void refetch()
  }

  return (
    <section aria-labelledby="valoracion-rango-titulo" className="mt-8 rounded-lg bg-surface-low p-4 sm:p-6">
      <header>
        <h2 id="valoracion-rango-titulo" className="font-heading text-xl font-semibold">Análisis del conteo por fechas</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Ventas estimadas a precio de venta e ingredientes consumidos a costo. Las pérdidas se muestran por separado, sin modificar la caja.</p>
      </header>
      <form className="mt-5" onSubmit={evento => { evento.preventDefault(); consultar() }}>
        <div className="flex flex-wrap gap-2" aria-label="Períodos rápidos">
          <Button type="button" variant="outline" size="sm" onClick={() => consultar(periodoRapido('hoy'))}>Hoy</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => consultar(periodoRapido('semana'))}>Últimos 7 días</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => consultar(periodoRapido('mes'))}>Este mes</Button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end lg:max-w-2xl">
          <div className="min-w-0">
            <Label htmlFor="desde-valoracion">Desde</Label>
            <Input id="desde-valoracion" type="date" min="2000-01-01" max="9998-12-31" value={borrador.desde} aria-invalid={!!errorFechas} aria-describedby={errorFechas ? 'error-fechas-valoracion' : undefined}
              onChange={e => { setBorrador({ ...borrador, desde: e.target.value }); setErrorFechas(null) }} className="mt-1 w-full" />
          </div>
          <div className="min-w-0">
            <Label htmlFor="hasta-valoracion">Hasta</Label>
            <Input id="hasta-valoracion" type="date" min="2000-01-01" max="9998-12-31" value={borrador.hasta} aria-invalid={!!errorFechas} aria-describedby={errorFechas ? 'error-fechas-valoracion' : undefined}
              onChange={e => { setBorrador({ ...borrador, hasta: e.target.value }); setErrorFechas(null) }} className="mt-1 w-full" />
          </div>
          <Button type="submit" className="btn-heat" disabled={isFetching && !cambioPendiente}>{isFetching && !cambioPendiente ? 'Consultando…' : 'Consultar'}</Button>
        </div>
        {errorFechas && <p id="error-fechas-valoracion" className="mt-2 text-sm text-destructive" role="alert">{errorFechas}</p>}
      </form>
      <p className="mt-5 text-sm font-medium" aria-live="polite">{fechaVisible(consulta.desde)} — {fechaVisible(consulta.hasta)} · {area === 'PANADERIA' ? 'Panadería' : 'Restaurante'}</p>
      {cambioPendiente && <p className="mt-1 text-xs text-tertiary">Pulsa Consultar para aplicar las nuevas fechas.</p>}
      {isPending ? <div className="mt-4 h-36 animate-pulse rounded-md bg-surface-high" aria-label="Cargando análisis del conteo" />
        : isError ? <div className="mt-4 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">No se pudo consultar el análisis.</p><Button variant="outline" size="sm" onClick={() => void refetch()}>Reintentar</Button></div>
          : data ? <>
            {excluidos > 0 && <p className="mt-3 text-sm text-tertiary">
              {excluidos} {excluidos === 1 ? 'conteo excluido' : 'conteos excluidos'}: {data.excluidos.sinValoracion} sin valoración histórica,{' '}
              {data.excluidos.pendientes} {data.excluidos.pendientes === 1 ? 'pendiente' : 'pendientes'}, {' '}
              {data.excluidos.recontar} por recontar, {data.excluidos.sinReferencia} sin referencia y{' '}
              {data.excluidos.noComparables} {data.excluidos.noComparables === 1 ? 'no comparable' : 'no comparables'}.
            </p>}
            {data.filas.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No hay conteos con valoración vigente en este rango. Prueba otras fechas o confirma los conteos pendientes.</p>
              : <div className="mt-5 space-y-6">
                <TablaPeriodo titulo="Productos · precio de venta" filas={data.filas.filter(f => f.tipoReferencia === 'PRECIO_VENTA')} ingrediente={false}
                  reconocido={data.totales.ingresoEstimado} perdida={data.totales.perdidaProductos} />
                <TablaPeriodo titulo="Ingredientes · costo unitario" filas={data.filas.filter(f => f.tipoReferencia === 'COSTO_UNITARIO')} ingrediente
                  reconocido={data.totales.costoConsumido} perdida={data.totales.perdidaIngredientes} />
              </div>}
            <p className="mt-4 max-w-2xl text-xs text-muted-foreground">Se conservan los precios y costos registrados en cada conteo. El ingreso estimado corresponde a salidas corroboradas, no a recaudo ni utilidad; el consumo de ingredientes no es ingreso. Los sobrantes no compensan pérdidas.</p>
          </> : null}
    </section>
  )
}

function TablaPeriodo({ titulo, filas, ingrediente, reconocido, perdida }: {
  titulo: string
  filas: ResumenValoracionRango['filas']
  ingrediente: boolean
  reconocido: string
  perdida: string
}) {
  if (filas.length === 0) return null
  return <section aria-label={titulo}>
    <h3 className="mb-3 text-sm font-semibold">{titulo}</h3>
    <dl className="mb-4 grid gap-3 sm:grid-cols-2">
      <div><dt className="text-xs text-muted-foreground">{ingrediente ? 'Costo consumido en el período' : 'Ingreso estimado en el período'}</dt>
        <dd className={`mt-1 font-heading text-xl font-semibold tabular-nums ${ingrediente ? 'text-sky-300' : 'text-emerald-300'}`}>{formatearPrecio(reconocido)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Pérdida estimada por faltantes</dt>
        <dd className={`mt-1 font-heading text-xl font-semibold tabular-nums ${Number(perdida) > 0 ? 'text-rose-300' : 'text-muted-foreground'}`}>{formatearPrecio(perdida)}</dd></div>
    </dl>
    <p className="mb-2 text-xs text-muted-foreground sm:hidden">Desliza la tabla para ver los importes →</p>
    <div className="overflow-x-auto rounded-md bg-surface-high">
      <table className="w-full min-w-[40rem] text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th scope="col" className="px-4 py-3">Artículo</th><th scope="col" className="px-4 py-3 text-right">Días valorados</th>
          <th scope="col" className="px-4 py-3 text-right">{ingrediente ? 'Costo consumido' : 'Ingreso estimado'}</th>
          <th scope="col" className="px-4 py-3 text-right">Pérdida por faltantes</th><th scope="col" className="px-4 py-3 text-right">Sobrante valorado</th>
        </tr></thead>
        <tbody>{filas.map(fila => <tr key={`${fila.tipo}:${fila.idObjetivo}`} className="border-b border-border/40 last:border-0">
          <th scope="row" className="px-4 py-3 text-left font-medium">{fila.nombre}<span className="mt-1 block text-xs font-normal text-muted-foreground">{fila.unidad}</span></th>
          <td className="px-4 py-3 text-right tabular-nums">{fila.diasValorados}</td>
          <td className={`px-4 py-3 text-right tabular-nums ${ingrediente ? 'text-sky-300' : 'text-emerald-300'}`}>{formatearPrecio(ingrediente ? fila.costoConsumido : fila.ingresoEstimado)}</td>
          <td className={`px-4 py-3 text-right tabular-nums ${Number(fila.perdidaEstimada) > 0 ? 'text-rose-300' : 'text-muted-foreground'}`}>{formatearPrecio(fila.perdidaEstimada)}</td>
          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatearPrecio(fila.valorSobrante)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}
