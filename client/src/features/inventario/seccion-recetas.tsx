import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, SquarePen } from 'lucide-react'
import { formatearCantidad, formatearFecha } from '@/lib/formato'
import { productosQuery } from '@/features/catalogo/api'
import { recetasQuery } from '@/features/inventario/api'
import { RecetaFormDialog } from '@/features/inventario/receta-form-dialog'
import type { Producto, Receta } from '@/types/api'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { BotonHeat } from './boton-heat'

export function SeccionRecetas({ esAdmin }: { esAdmin: boolean }) {
  const { data: productos, isPending: cargandoProductos } = useQuery(productosQuery)
  const { data: recetas, isPending: cargandoRecetas } = useQuery(recetasQuery)
  const [busqueda, setBusqueda] = useState('')
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [dialogo, setDialogo] = useState<{ producto: Producto; recetaBase: Receta | null } | null>(null)

  if (cargandoProductos || cargandoRecetas) {
    return <p className="text-sm text-muted-foreground">Cargando recetas…</p>
  }

  const activaPorProducto = new Map<number, Receta>()
  for (const receta of recetas ?? []) {
    if (receta.receta_activa) activaPorProducto.set(receta.id_producto_receta, receta)
  }

  const conReceta = (productos ?? [])
    .map((producto) => ({ producto, receta: activaPorProducto.get(producto.id_producto) }))
    .filter((x): x is { producto: Producto; receta: Receta } => Boolean(x.receta))

  const sinReceta = (productos ?? []).filter((p) => !activaPorProducto.has(p.id_producto))

  const termino = busqueda.trim().toLowerCase()
  const visibles = conReceta.filter(
    ({ producto, receta }) =>
      termino === '' ||
      producto.nombre_producto.toLowerCase().includes(termino) ||
      receta.nombre_receta.toLowerCase().includes(termino),
  )

  return (
    <div>
      {/* Resumen + buscador + accion */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{conReceta.length}</span>{' '}
          {conReceta.length === 1 ? 'receta activa' : 'recetas activas'}
          {sinReceta.length > 0 ? (
            <>
              {' · '}
              <span className="tabular-nums">{sinReceta.length}</span>{' '}
              {sinReceta.length === 1 ? 'producto sin receta' : 'productos sin receta'}
            </>
          ) : null}
        </p>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar receta…"
              className="h-11 border-transparent bg-surface-low pl-10"
            />
          </div>
          {esAdmin ? (
            <BotonHeat onClick={() => setSelectorAbierto(true)} disabled={sinReceta.length === 0}>
              Nueva receta
            </BotonHeat>
          ) : null}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {conReceta.length === 0
            ? 'Aun no hay recetas. Crea una para que los pedidos descuenten inventario.'
            : 'Ninguna receta coincide con la busqueda.'}
        </p>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map(({ producto, receta }) => (
            <TarjetaReceta
              key={producto.id_producto}
              producto={producto}
              receta={receta}
              esAdmin={esAdmin}
              onEditar={() => setDialogo({ producto, recetaBase: receta })}
            />
          ))}
        </ul>
      )}

      <SelectorProductoDialog
        abierto={selectorAbierto}
        productos={sinReceta}
        onElegir={(producto) => {
          setSelectorAbierto(false)
          setDialogo({ producto, recetaBase: null })
        }}
        onCerrar={() => setSelectorAbierto(false)}
      />
      <RecetaFormDialog
        producto={dialogo?.producto ?? null}
        recetaBase={dialogo?.recetaBase ?? null}
        onCerrar={() => setDialogo(null)}
      />
    </div>
  )
}

function TarjetaReceta({
  producto,
  receta,
  esAdmin,
  onEditar,
}: {
  producto: Producto
  receta: Receta
  esAdmin: boolean
  onEditar: () => void
}) {
  const activo = producto.habilitado_producto

  return (
    <li
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border-l-4 bg-surface-high',
        activo ? 'border-primary' : 'border-tertiary',
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-lg font-bold uppercase leading-tight tracking-tight">
            {producto.nombre_producto}
          </h3>
          {activo ? (
            <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              Activa
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-tertiary/40 bg-tertiary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-tertiary">
              Deshabilitado
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="micro-label">ID · #{String(receta.id_receta).padStart(3, '0')}</span>
          <span className="micro-label">Creada · {formatearFecha(receta.fecha_creacion_receta)}</span>
        </div>
      </div>

      <div className="mx-5 border-t border-border" />

      <ul className="flex-1 space-y-2.5 p-5">
        {receta.detalles?.map((d) => (
          <li key={d.id_detalleReceta} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {d.ingrediente?.nombre_ingrediente ?? `Ingrediente ${d.id_ingrediente_detalleReceta}`}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatearCantidad(d.cantidad_ingrediente_detalleReceta)}{' '}
              {d.ingrediente?.unidades_ingrediente ?? ''}
            </span>
          </li>
        ))}
      </ul>

      {esAdmin ? (
        <div className="p-5 pt-0">
          <button
            type="button"
            onClick={onEditar}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-surface-lowest py-3 font-heading text-sm font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-primary"
          >
            <SquarePen className="size-4" />
            Editar receta
          </button>
        </div>
      ) : null}
    </li>
  )
}

function SelectorProductoDialog({
  abierto,
  productos,
  onElegir,
  onCerrar,
}: {
  abierto: boolean
  productos: Producto[]
  onElegir: (producto: Producto) => void
  onCerrar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const termino = busqueda.trim().toLowerCase()
  const visibles = productos.filter(
    (p) => termino === '' || p.nombre_producto.toLowerCase().includes(termino),
  )

  return (
    <Dialog
      open={abierto}
      onOpenChange={(open) => {
        if (!open) {
          setBusqueda('')
          onCerrar()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Nueva receta</DialogTitle>
          <DialogDescription>Elige el producto al que le vas a crear la receta.</DialogDescription>
        </DialogHeader>

        {productos.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Todos los productos ya tienen receta.</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto…"
                className="pl-10"
                autoFocus
              />
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {visibles.map((p) => (
                <li key={p.id_producto}>
                  <button
                    type="button"
                    onClick={() => onElegir(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-high"
                  >
                    <span className="font-medium">{p.nombre_producto}</span>
                    <span className="micro-label shrink-0">
                      {p.categoria?.nombre_categoria ?? 'Sin categoria'}
                    </span>
                  </button>
                </li>
              ))}
              {visibles.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">Ningun producto coincide.</li>
              ) : null}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
