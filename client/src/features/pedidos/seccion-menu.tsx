import { useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatearPrecio } from '@/lib/formato'
import { combosQuery, productosQuery } from '@/features/catalogo/api'
import { ProductoImagen } from '@/features/catalogo/producto-imagen'
import type { SeleccionMenu } from '@/features/pedidos/personalizar-dialog'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const CHIP_COMBOS = 'combos'

function normalizarBusqueda(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
}

export function SeccionMenu({ onSeleccionar }: { onSeleccionar: (s: SeleccionMenu) => void }) {
  const { data: productos } = useQuery(productosQuery)
  const { data: combos } = useQuery(combosQuery)
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todas')
  const [busqueda, setBusqueda] = useState('')
  const buscadorRef = useRef<HTMLInputElement>(null)
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean)
  const coincide = (nombre: string) => palabras.every((palabra) => normalizarBusqueda(nombre).includes(palabra))

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

  const productosFiltrados = disponibles.filter((p) =>
    (categoriaActiva === 'todas' || (p.categoria?.nombre_categoria ?? 'Sin categoria') === categoriaActiva)
    && coincide(p.nombre_producto),
  )
  const combosFiltrados = combosActivos.filter((combo) => coincide(combo.nombre_combo))
  const sinResultados = categoriaActiva === CHIP_COMBOS ? combosFiltrados.length === 0 : productosFiltrados.length === 0

  const chips = ['todas', ...categorias, ...(combosActivos.length > 0 ? [CHIP_COMBOS] : [])]

  return (
    <div className="mt-6">
      <div className="relative mb-4">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={buscadorRef}
          autoFocus
          type="search"
          aria-label="Buscar productos o combos por nombre"
          placeholder="Buscar productos o combos por nombre…"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          className="h-11 bg-surface-high pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {busqueda ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => {
              setBusqueda('')
              buscadorRef.current?.focus()
            }}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
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

      {sinResultados ? (
        <p role="status" className="mt-4 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          {palabras.length > 0
            ? 'No hay coincidencias en esta categoría. Prueba otro nombre o cambia de categoría.'
            : 'No hay productos disponibles en esta categoría.'}
        </p>
      ) : categoriaActiva === CHIP_COMBOS ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {combosFiltrados.map((combo) => (
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
