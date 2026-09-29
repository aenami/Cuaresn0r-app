import type { ValoracionConteo } from './valoracion-types'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'

const motivos: Record<Exclude<ValoracionConteo['estado'], 'VALIDA'>, string> = {
  PENDIENTE: 'Valoración pendiente de conteo',
  RECONTAR: 'Requiere reconteo',
  NO_COMPARABLE: 'Sin base comparable',
  SIN_REFERENCIA: 'Sin costo de referencia',
  SIN_VALORACION_HISTORICA: 'Sin valoración histórica',
}

export function ValoracionDelConteo({ valoracion, pendiente = false, esIngrediente = false }: {
  valoracion?: ValoracionConteo | null
  pendiente?: boolean
  esIngrediente?: boolean
}) {
  const estado = valoracion?.estado ?? (pendiente ? 'PENDIENTE' : 'SIN_VALORACION_HISTORICA')
  const ingrediente = (valoracion?.tipoReferencia ?? (esIngrediente ? 'COSTO_UNITARIO' : 'PRECIO_VENTA')) === 'COSTO_UNITARIO'
  return (
    <section aria-label="Valoración monetaria del conteo" className="mt-4 border-t border-border/70 pt-3">
      {estado !== 'VALIDA' ? (
        <p className="text-xs text-tertiary" role="status">{motivos[estado]}</p>
      ) : valoracion ? (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{ingrediente ? 'Costo consumido' : 'Ingreso estimado'}</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${ingrediente ? 'text-sky-300' : 'text-emerald-300'}`}>
                {formatearPrecio((ingrediente ? valoracion.costoConsumido : valoracion.ingresoEstimado) ?? '0')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pérdida estimada</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${Number(valoracion.perdidaEstimada) > 0 ? 'text-rose-300' : 'text-muted-foreground'}`}>
                {formatearPrecio(valoracion.perdidaEstimada ?? '0')}
              </dd>
            </div>
          </dl>
          {Number(valoracion.cantidadSobrante) > 0 ? (
            <p className="mt-2 text-xs text-tertiary">Sobrante: {formatearCantidad(valoracion.cantidadSobrante)} {valoracion.unidad} · {formatearPrecio(valoracion.valorSobrante ?? '0')}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {ingrediente ? 'Costo' : 'Precio'} registrado: {formatearPrecio(valoracion.precioReferencia ?? '0')} / {valoracion.unidad}
          </p>
        </>
      ) : null}
    </section>
  )
}
