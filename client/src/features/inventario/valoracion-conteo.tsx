import type { ValoracionConteo } from './valoracion-types'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'

const motivos: Record<Exclude<ValoracionConteo['estado'], 'VALIDA'>, string> = {
  PENDIENTE: 'Confirma el conteo físico para calcular los importes.',
  RECONTAR: 'Hubo movimientos después del conteo. Vuelve a contar para actualizar la valoración.',
  NO_COMPARABLE: 'No hay una base diaria comparable; este conteo no suma a la estadística monetaria.',
  SIN_REFERENCIA: 'Falta configurar el costo de referencia de este ingrediente. No se presupone un costo de $0.',
  SIN_VALORACION_HISTORICA: 'Este registro es anterior a la valoración monetaria. No se le asignan precios de hoy.',
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
      <h4 className="text-sm font-semibold">{ingrediente ? 'Valoración del ingrediente' : 'Valoración del producto'}</h4>
      {estado !== 'VALIDA' ? (
        <p className="mt-2 text-sm text-tertiary" role="status">{valoracion?.motivo ?? motivos[estado]}</p>
      ) : valoracion ? (
        <>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{ingrediente ? 'Costo consumido' : 'Ingreso estimado por ventas'}</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${ingrediente ? 'text-sky-300' : 'text-emerald-300'}`}>
                {formatearPrecio((ingrediente ? valoracion.costoConsumido : valoracion.ingresoEstimado) ?? '0')}
                <p className="mt-1 text-xs font-normal text-muted-foreground">{formatearCantidad(valoracion.cantidadReconocida)} {valoracion.unidad} {ingrediente ? 'de consumo corroborado' : 'de venta corroborada'}</p>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pérdida estimada por faltantes</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${Number(valoracion.perdidaEstimada) > 0 ? 'text-rose-300' : 'text-muted-foreground'}`}>
                {formatearPrecio(valoracion.perdidaEstimada ?? '0')}
                <p className="mt-1 text-xs font-normal text-muted-foreground">{formatearCantidad(valoracion.cantidadFaltante)} {valoracion.unidad} sin salida justificada</p>
              </dd>
            </div>
          </dl>
          {Number(valoracion.cantidadSobrante) > 0 ? (
            <p className="mt-3 text-xs text-tertiary">Sobrante: {formatearCantidad(valoracion.cantidadSobrante)} {valoracion.unidad} · {formatearPrecio(valoracion.valorSobrante ?? '0')}. Se registra aparte; no es ingreso ni compensa pérdidas.</p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {ingrediente ? 'Costo' : 'Precio de venta'} al confirmar: {formatearPrecio(valoracion.precioReferencia ?? '0')} / {valoracion.unidad}.
            {' '}{ingrediente ? 'El consumo no representa dinero cobrado.' : 'Estimación de inventario, no recaudo confirmado ni utilidad.'}
          </p>
        </>
      ) : null}
    </section>
  )
}
