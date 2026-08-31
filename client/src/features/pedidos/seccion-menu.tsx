import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatearPrecio } from '@/lib/formato'
import { combosQuery, productosQuery } from '@/features/catalogo/api'
import { ProductoImagen } from '@/features/catalogo/producto-imagen'
import type { SeleccionMenu } from '@/features/pedidos/personalizar-dialog'
import { cn } from '@/lib/utils'

const CHIP_COMBOS = 'combos'

export function SeccionMenu({ onSeleccionar }: { onSeleccionar: (s: SeleccionMenu) => void }) {
  const { data: productos } = useQuery(productosQuery)
  const { data: combos } = useQuery(combosQuery)
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todas')

  // Las adiciones (categorias marcadas "de adiciones") no se piden sueltas: solo
  // aparecen al personalizar un item, no en el menu.
  const disponibles = useMemo(
    () => (productos ?? []).filter((p) => p.habilitado_producto && !p.categoria?.es_adicion),
    [productos],
  )
  const combosActivos = useMemo(() => (combos ?? []).filter((c) => c.combo_activo), [combos])

  const categorias = useMemo(() => {
    const nombres = new Map<string, string>()
    for (const p of disponibles) {
      const nombre = p.categoria?.nombre_categoria ?? 'Sin categoria'
      nombres.set(nombre, nombre)
    }
    return [...nombres.keys()].sort((a, b) => a.localeCompare(b))
  }, [disponibles])

  const productosFiltrados =
    categoriaActiva === 'todas'
      ? disponibles
      : disponibles.filter((p) => (p.categoria?.nombre_categoria ?? 'Sin categoria') === categoriaActiva)

  const chips = ['todas', ...categorias, ...(combosActivos.length > 0 ? [CHIP_COMBOS] : [])]

  return (
    <div className="mt-6">
      <div className="scrollbar-fina flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Categorias del menu">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            role="tab"
            aria-selected={categoriaActiva === chip}
            onClick={() => setCategoriaActiva(chip)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
              categoriaActiva === chip
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {chip === CHIP_COMBOS ? 'Combos' : chip}
          </button>
        ))}
      </div>

      {categoriaActiva === CHIP_COMBOS ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {combosActivos.map((combo) => (
            <li key={combo.id_combo}>
              <button
                type="button"
                onClick={() => onSeleccionar({ tipo: 'combo', combo })}
                className="w-full rounded-lg border-l-4 border-tertiary bg-surface-high p-3 text-left transition-transform hover:-translate-y-0.5 hover:brightness-110"
              >
                <h3 className="font-heading text-sm font-semibold leading-tight">{combo.nombre_combo}</h3>
                <ul className="mt-1.5 text-xs text-muted-foreground">
                  {combo.detallesCombo?.map((d) => (
                    <li key={d.id_detalleCombo}>
                      {Number(d.cantidad_detalleCombo)} × {d.producto?.nombre_producto}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-heading text-sm tabular-nums text-primary">
                  {formatearPrecio(combo.precio_combo)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {productosFiltrados.map((producto) => (
            <li key={producto.id_producto}>
              <button
                type="button"
                onClick={() => onSeleccionar({ tipo: 'producto', producto })}
                className="w-full overflow-hidden rounded-lg bg-surface-high text-left transition-transform hover:-translate-y-0.5 hover:brightness-110"
              >
                <ProductoImagen
                  src={producto.imagen_producto}
                  nombre={producto.nombre_producto}
                  className="aspect-video w-full"
                />
                <div className="flex items-start justify-between gap-2 p-2.5">
                  <h3 className="font-heading text-sm font-semibold leading-tight">
                    {producto.nombre_producto}
                  </h3>
                  <span className="shrink-0 font-heading text-sm tabular-nums text-primary">
                    {formatearPrecio(producto.precio_producto)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
