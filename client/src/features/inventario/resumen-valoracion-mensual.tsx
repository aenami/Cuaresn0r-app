import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAreaTrabajo } from '@/stores/auth.store'
import { formatearPrecio } from '@/lib/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ResumenValoracionMensual } from './valoracion-types'

function mesActual() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${partes.find(p => p.type === 'year')!.value}-${partes.find(p => p.type === 'month')!.value}`
}

export function ResumenMonetarioMensual() {
  const area = useAreaTrabajo()
  const [mes, setMes] = useState(mesActual)
  const mesValido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['inventario', 'valoracion-mensual', area, mes],
    queryFn: () => api.get<ResumenValoracionMensual>(`/recipes/inventory-valuation/monthly?month=${mes}`),
    enabled: mesValido,
    staleTime: 30_000,
    refetchInterval: mes === mesActual() ? 30_000 : false,
  })
  const excluidos = data ? Object.values(data.excluidos).reduce((total, cantidad) => total + cantidad, 0) : 0
  return (
    <section aria-labelledby="valoracion-mensual-titulo" className="mt-8 rounded-lg bg-surface-low p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="valoracion-mensual-titulo" className="font-heading text-xl font-semibold">Valoración mensual del inventario</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Precios y costos guardados al confirmar cada conteo. Ventas estimadas, consumo y faltantes se muestran por separado; no modifican la caja.</p>
        </div>
        <div className="w-full sm:w-auto">
          <Label htmlFor="mes-valoracion">Mes</Label>
          <Input id="mes-valoracion" type="month" value={mes} min="2000-01" max="9998-12" onChange={e => setMes(e.target.value)} className="mt-1 w-full sm:w-60" />
        </div>
      </header>
      {!mesValido ? <p className="mt-4 text-sm text-tertiary">Elige un mes para consultar el historial.</p>
        : isPending ? <div className="mt-5 h-36 animate-pulse rounded-md bg-surface-high" aria-label="Cargando valoración mensual" />
          : isError ? <div className="mt-5 flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-destructive">No se pudo consultar la valoración mensual.</p><Button variant="outline" size="sm" onClick={() => void refetch()}>Reintentar</Button></div>
            : data ? <>
              {excluidos > 0 && <p className="mt-4 text-sm text-tertiary">{excluidos} conteos no suman a estos importes: {data.excluidos.sinValoracion} sin valoración histórica, {data.excluidos.pendientes} pendientes, {data.excluidos.recontar} por recontar, {data.excluidos.sinReferencia} sin referencia y {data.excluidos.noComparables} no comparables.</p>}
              {data.filas.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">Todavía no hay conteos con valoración vigente para este mes. Confirma conteos con un precio o costo configurado para comenzar el historial.</p>
                : <div className="mt-5 space-y-6">
                  <TablaMensual titulo="Productos · precio de venta" filas={data.filas.filter(f => f.tipoReferencia === 'PRECIO_VENTA')} ingrediente={false} />
                  <TablaMensual titulo="Ingredientes · costo unitario" filas={data.filas.filter(f => f.tipoReferencia === 'COSTO_UNITARIO')} ingrediente />
                </div>}
              <p className="mt-4 text-xs text-muted-foreground">El ingreso es una estimación asociada a salidas corroboradas, no dinero cobrado ni utilidad. Un sobrante no se registra como ingreso y no compensa faltantes de otros artículos.</p>
            </> : null}
    </section>
  )
}

function TablaMensual({ titulo, filas, ingrediente }: {
  titulo: string
  filas: ResumenValoracionMensual['filas']
  ingrediente: boolean
}) {
  if (filas.length === 0) return null
  return <section aria-label={titulo}>
    <h3 className="mb-3 text-sm font-semibold">{titulo}</h3>
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
