import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatearPrecio } from '@/lib/formato'
import {
  categoriasQuery,
  productosQuery,
  useCambiarHabilitadoProducto,
} from '@/features/catalogo/api'
import { ProductoFormDialog } from '@/features/catalogo/producto-form-dialog'
import { ProductoImagen } from '@/features/catalogo/producto-imagen'
import type { Producto } from '@/types/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { errorATexto } from './comun'
import { BotonNuevo } from './boton-nuevo'

export function SeccionProductos({ esAdmin, busqueda }: { esAdmin: boolean; busqueda: string }) {
  const { data: productos, isPending } = useQuery(productosQuery)
  const { data: categorias } = useQuery(categoriasQuery)
  const cambiarHabilitado = useCambiarHabilitadoProducto()
  const [categoriaSel, setCategoriaSel] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<{ abierto: boolean; producto: Producto | null }>({
    abierto: false,
    producto: null,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Cargando productos…</p>

  // Ordinal estable por categoria (id ascendente): "CATEGORIA // 01".
  const ordinal = new Map<number, number>()
  const contadorPorCat = new Map<number, number>()
  for (const p of [...(productos ?? [])].sort((a, b) => a.id_producto - b.id_producto)) {
    const cat = p.categoria_producto ?? -1
    const n = (contadorPorCat.get(cat) ?? 0) + 1
    contadorPorCat.set(cat, n)
    ordinal.set(p.id_producto, n)
  }

  const termino = busqueda.trim().toLowerCase()
  const visibles = (productos ?? []).filter((p) => {
    const porCategoria = categoriaSel === null || p.categoria_producto === categoriaSel
    const porTexto = termino === '' || p.nombre_producto.toLowerCase().includes(termino)
    return porCategoria && porTexto
  })

  return (
    <div>
      {/* Filtros por categoria + accion */}
      <div className="mb-9 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ChipCategoria activo={categoriaSel === null} onClick={() => setCategoriaSel(null)}>
            Todos
          </ChipCategoria>
          {categorias?.map((c) => (
            <ChipCategoria
              key={c.id_categoria}
              activo={categoriaSel === c.id_categoria}
              onClick={() => setCategoriaSel(c.id_categoria)}
            >
              {c.nombre_categoria}
            </ChipCategoria>
          ))}
        </div>
        {esAdmin ? (
          <BotonNuevo onClick={() => setDialogo({ abierto: true, producto: null })}>
            Nuevo producto
          </BotonNuevo>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {productos?.length === 0
            ? 'No hay productos. Crea el primero para armar el menu.'
            : 'Ningun producto coincide con el filtro.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {visibles.map((producto) => (
            <li
              key={producto.id_producto}
              className={cn(
                'group flex flex-col overflow-hidden rounded-xl border-b-4 bg-surface-high transition-transform hover:-translate-y-0.5',
                producto.habilitado_producto ? 'border-primary' : 'border-muted-foreground/30',
              )}
            >
              <div className="relative">
                <ProductoImagen
                  src={producto.imagen_producto}
                  nombre={producto.nombre_producto}
                  className="aspect-[4/3] w-full"
                />
                <BadgeDisponible habilitado={producto.habilitado_producto} />
              </div>

              <div className="flex flex-1 flex-col p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
                  {producto.categoria?.nombre_categoria ?? 'Sin categoria'}
                  {' // '}
                  {String(ordinal.get(producto.id_producto) ?? 0).padStart(2, '0')}
                </p>
                <h3 className="mt-1.5 font-heading text-base font-bold uppercase leading-tight tracking-tight">
                  {producto.nombre_producto}
                </h3>
                <p className="mt-auto pt-4 font-heading text-2xl font-medium tabular-nums text-muted-foreground">
                  {formatearPrecio(producto.precio_producto)}
                </p>

                {esAdmin ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1 text-xs"
                      onClick={() => setDialogo({ abierto: true, producto })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 flex-1 text-xs text-muted-foreground"
                      disabled={cambiarHabilitado.isPending}
                      onClick={() =>
                        cambiarHabilitado
                          .mutateAsync({
                            id: producto.id_producto,
                            habilitar: !producto.habilitado_producto,
                          })
                          .then(() =>
                            toast.success(
                              producto.habilitado_producto
                                ? 'Producto deshabilitado'
                                : 'Producto habilitado',
                            ),
                          )
                          .catch((e: unknown) => toast.error(errorATexto(e)))
                      }
                    >
                      {producto.habilitado_producto ? 'Deshabilitar' : 'Habilitar'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ProductoFormDialog
        producto={dialogo.producto}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  )
}

function ChipCategoria({
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
        'rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
        activo
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function BadgeDisponible({ habilitado }: { habilitado: boolean }) {
  return (
    <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-surface-lowest/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ring-white/10">
      <span className={cn('size-1.5 rounded-full', habilitado ? 'bg-primary' : 'bg-muted-foreground')} />
      <span className={habilitado ? 'text-foreground' : 'text-muted-foreground'}>
        {habilitado ? 'Disponible' : 'No disponible'}
      </span>
    </span>
  )
}
