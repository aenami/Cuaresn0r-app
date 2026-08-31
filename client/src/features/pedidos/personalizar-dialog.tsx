import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { productosQuery } from '@/features/catalogo/api'
import { recetasQuery } from '@/features/inventario/api'
import { formatearPrecio } from '@/lib/formato'
import type { Combo, Producto, Receta } from '@/types/api'
import type {
  AdicionCarrito,
  ItemCarrito,
  PersonalizacionCarrito,
} from '@/features/pedidos/carrito.store'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type SeleccionMenu =
  | { tipo: 'producto'; producto: Producto }
  | { tipo: 'combo'; combo: Combo }

// Los ingredientes de la receta solo se pueden dejar o quitar; un "extra" con
// precio se pide como adicion.
type ModoIngrediente = 'normal' | 'sin'
// Clave "contexto:idIngrediente" — contexto 0 = producto directo, para combos
// es el id del producto componente.
type EstadoIngredientes = Map<string, ModoIngrediente>

function claveIngrediente(contexto: number, idIngrediente: number): string {
  return `${contexto}:${idIngrediente}`
}

export function PersonalizarDialog({
  seleccion,
  onAgregar,
  onCerrar,
}: {
  seleccion: SeleccionMenu | null
  onAgregar: (item: ItemCarrito) => void
  onCerrar: () => void
}) {
  const { data: recetas } = useQuery(recetasQuery)
  const { data: productos } = useQuery(productosQuery)

  const [cantidad, setCantidad] = useState(1)
  const [indicaciones, setIndicaciones] = useState('')
  const [ingredientes, setIngredientes] = useState<EstadoIngredientes>(new Map())
  const [adiciones, setAdiciones] = useState<Map<number, number>>(new Map())
  const [busquedaAdicion, setBusquedaAdicion] = useState('')

  useEffect(() => {
    if (seleccion) {
      setCantidad(1)
      setIndicaciones('')
      setIngredientes(new Map())
      setAdiciones(new Map())
      setBusquedaAdicion('')
    }
  }, [seleccion])

  const recetaActivaPorProducto = useMemo(() => {
    const mapa = new Map<number, Receta>()
    for (const receta of recetas ?? []) {
      if (receta.receta_activa) mapa.set(receta.id_producto_receta, receta)
    }
    return mapa
  }, [recetas])

  // Adiciones ofrecidas: productos habilitados de cualquier categoria marcada
  // como "de adiciones". Se agrupan por categoria y se filtran por el buscador.
  const productosAdicion = useMemo(
    () => (productos ?? []).filter((p) => p.habilitado_producto && p.categoria?.es_adicion),
    [productos],
  )

  const gruposAdicion = useMemo(() => {
    const term = busquedaAdicion.trim().toLowerCase()
    const filtrados = term
      ? productosAdicion.filter((p) => p.nombre_producto.toLowerCase().includes(term))
      : productosAdicion
    const grupos = new Map<string, Producto[]>()
    for (const p of filtrados) {
      const g = p.categoria?.nombre_categoria ?? 'Adiciones'
      if (!grupos.has(g)) grupos.set(g, [])
      grupos.get(g)!.push(p)
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [productosAdicion, busquedaAdicion])

  if (!seleccion) return null

  const nombre = seleccion.tipo === 'producto' ? seleccion.producto.nombre_producto : seleccion.combo.nombre_combo
  const precio = Number(
    seleccion.tipo === 'producto' ? seleccion.producto.precio_producto : seleccion.combo.precio_combo,
  )

  const totalAdiciones = [...adiciones.entries()].reduce((acc, [idProducto, cant]) => {
    const producto = productosAdicion.find((p) => p.id_producto === idProducto)
    return acc + (producto ? Number(producto.precio_producto) * cant : 0)
  }, 0)
  const total = precio * cantidad + totalAdiciones

  function cambiarModo(contexto: number, idIngrediente: number, modo: ModoIngrediente) {
    setIngredientes((prev) => {
      const siguiente = new Map(prev)
      siguiente.set(claveIngrediente(contexto, idIngrediente), modo)
      return siguiente
    })
  }

  function personalizacionesDe(contexto: number, receta: Receta | undefined): PersonalizacionCarrito[] {
    if (!receta?.detalles) return []
    const resultado: PersonalizacionCarrito[] = []
    for (const detalle of receta.detalles) {
      const modo = ingredientes.get(claveIngrediente(contexto, detalle.id_ingrediente_detalleReceta)) ?? 'normal'
      if (modo === 'normal') continue
      resultado.push({
        idIngrediente: detalle.id_ingrediente_detalleReceta,
        nombre: detalle.ingrediente?.nombre_ingrediente ?? `Ingrediente ${detalle.id_ingrediente_detalleReceta}`,
        modo,
        cantidadReceta: Number(detalle.cantidad_ingrediente_detalleReceta),
      })
    }
    return resultado
  }

  function agregar() {
    const sel = seleccion
    if (!sel) return
    const listaAdiciones: AdicionCarrito[] = [...adiciones.entries()]
      .filter(([, cant]) => cant > 0)
      .map(([idProducto, cant]) => {
        const producto = productosAdicion.find((p) => p.id_producto === idProducto)!
        return {
          idProducto,
          nombre: producto.nombre_producto,
          precio: Number(producto.precio_producto),
          cantidad: cant,
        }
      })

    const base = {
      uid: crypto.randomUUID(),
      nombre,
      precioUnitario: precio,
      cantidad,
      ...(indicaciones.trim() ? { indicaciones: indicaciones.trim() } : {}),
      adiciones: listaAdiciones,
    }

    if (sel.tipo === 'producto') {
      const producto = sel.producto
      onAgregar({
        ...base,
        tipo: 'producto',
        id: producto.id_producto,
        personalizaciones: personalizacionesDe(0, recetaActivaPorProducto.get(producto.id_producto)),
        componentes: [],
      })
    } else {
      const combo = sel.combo
      onAgregar({
        ...base,
        tipo: 'combo',
        id: combo.id_combo,
        personalizaciones: [],
        componentes: (combo.detallesCombo ?? []).map((d) => ({
          idProducto: d.id_producto_detalleCombo,
          nombre: d.producto?.nombre_producto ?? `Producto ${d.id_producto_detalleCombo}`,
          cantidadComponente: Number(d.cantidad_detalleCombo),
          personalizaciones: personalizacionesDe(
            d.id_producto_detalleCombo,
            recetaActivaPorProducto.get(d.id_producto_detalleCombo),
          ),
        })),
      })
    }
    onCerrar()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b-4 border-primary p-5 pb-4">
          <DialogTitle className="flex items-baseline justify-between gap-3 font-heading tracking-tight">
            <span>{nombre}</span>
            <span className="tabular-nums text-primary">{formatearPrecio(precio)}</span>
          </DialogTitle>
          <DialogDescription>
            {seleccion.tipo === 'combo'
              ? 'Personaliza cada producto del combo antes de enviarlo.'
              : 'Ajusta ingredientes, indicaciones y adiciones.'}
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-fina min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 p-5">
            {/* Cantidad */}
            <section className="flex items-center justify-between">
              <p className="micro-label">Cantidad</p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-9 text-lg"
                  onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  aria-label="Restar cantidad"
                >
                  −
                </Button>
                <span className="w-6 text-center font-heading text-lg tabular-nums">{cantidad}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 w-9 text-lg"
                  onClick={() => setCantidad((c) => c + 1)}
                  aria-label="Sumar cantidad"
                >
                  +
                </Button>
              </div>
            </section>

            {/* Ingredientes */}
            {seleccion.tipo === 'producto' ? (
              <SeccionIngredientes
                titulo="Ingredientes"
                contexto={0}
                receta={recetaActivaPorProducto.get(seleccion.producto.id_producto)}
                estado={ingredientes}
                onCambiar={cambiarModo}
              />
            ) : (
              (seleccion.combo.detallesCombo ?? []).map((d) => (
                <SeccionIngredientes
                  key={d.id_detalleCombo}
                  titulo={`${d.producto?.nombre_producto ?? 'Producto'}${Number(d.cantidad_detalleCombo) > 1 ? ` ×${Number(d.cantidad_detalleCombo)}` : ''}`}
                  contexto={d.id_producto_detalleCombo}
                  receta={recetaActivaPorProducto.get(d.id_producto_detalleCombo)}
                  estado={ingredientes}
                  onCambiar={cambiarModo}
                />
              ))
            )}

            {/* Adiciones (agrupadas por categoria + buscador) */}
            <section>
              <p className="micro-label mb-2">Adiciones (se cobran)</p>
              {productosAdicion.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay adiciones en el catalogo. Crealas como productos en una categoria marcada
                  “de adiciones”.
                </p>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={busquedaAdicion}
                      onChange={(e) => setBusquedaAdicion(e.target.value)}
                      placeholder="Buscar adicion…"
                      className="h-9 bg-surface-lowest pl-9"
                    />
                  </div>
                  {gruposAdicion.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguna adicion coincide con la busqueda.</p>
                  ) : (
                    <div className="space-y-4">
                      {gruposAdicion.map(([grupo, items]) => (
                        <div key={grupo}>
                          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                            {grupo}
                          </p>
                          <ul className="space-y-2">
                            {items.map((producto) => (
                              <FilaAdicion
                                key={producto.id_producto}
                                producto={producto}
                                cant={adiciones.get(producto.id_producto) ?? 0}
                                onMenos={() =>
                                  setAdiciones((prev) => {
                                    const siguiente = new Map(prev)
                                    const c = siguiente.get(producto.id_producto) ?? 0
                                    if (c <= 1) siguiente.delete(producto.id_producto)
                                    else siguiente.set(producto.id_producto, c - 1)
                                    return siguiente
                                  })
                                }
                                onMas={() =>
                                  setAdiciones((prev) =>
                                    new Map(prev).set(
                                      producto.id_producto,
                                      (prev.get(producto.id_producto) ?? 0) + 1,
                                    ),
                                  )
                                }
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Indicaciones */}
            <section>
              <p className="micro-label mb-2">Indicaciones para cocina</p>
              <Textarea
                rows={2}
                maxLength={150}
                placeholder="Ej: termino medio, salsas aparte…"
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
              />
            </section>
          </div>
        </div>

        <div className="glass-panel border-t border-border p-4">
          <Button type="button" className="btn-heat w-full justify-between font-heading" onClick={agregar}>
            <span>Agregar a la comanda</span>
            <span className="tabular-nums">{formatearPrecio(total)}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SeccionIngredientes({
  titulo,
  contexto,
  receta,
  estado,
  onCambiar,
}: {
  titulo: string
  contexto: number
  receta: Receta | undefined
  estado: EstadoIngredientes
  onCambiar: (contexto: number, idIngrediente: number, modo: ModoIngrediente) => void
}) {
  return (
    <section>
      <p className="micro-label mb-2">{titulo}</p>
      {receta?.detalles?.length ? (
        <ul className="space-y-1.5">
          {receta.detalles.map((detalle) => {
            const modo = estado.get(claveIngrediente(contexto, detalle.id_ingrediente_detalleReceta)) ?? 'normal'
            return (
              <li key={detalle.id_detalleReceta} className="flex items-center justify-between gap-3">
                <span className={cn('text-sm', modo === 'sin' && 'text-muted-foreground line-through')}>
                  {detalle.ingrediente?.nombre_ingrediente ?? `Ingrediente ${detalle.id_ingrediente_detalleReceta}`}
                </span>
                <div className="flex overflow-hidden rounded-md bg-surface-lowest" role="group" aria-label={`Modo de ${detalle.ingrediente?.nombre_ingrediente}`}>
                  {(['normal', 'sin'] as const).map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => onCambiar(contexto, detalle.id_ingrediente_detalleReceta, opcion)}
                      aria-pressed={modo === opcion}
                      className={cn(
                        'px-2.5 py-1 text-xs uppercase tracking-wide transition-colors',
                        modo === opcion
                          ? opcion === 'sin'
                            ? 'bg-destructive/20 font-semibold text-destructive'
                            : 'bg-secondary font-semibold text-secondary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {opcion}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin receta: no hay ingredientes para ajustar.</p>
      )}
    </section>
  )
}

// Una adicion con su stepper de cantidad.
function FilaAdicion({
  producto,
  cant,
  onMenos,
  onMas,
}: {
  producto: Producto
  cant: number
  onMenos: () => void
  onMas: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm">
        {producto.nombre_producto}
        <span className="ml-2 text-muted-foreground tabular-nums">{formatearPrecio(producto.precio_producto)}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7"
          disabled={cant === 0}
          onClick={onMenos}
          aria-label={`Quitar ${producto.nombre_producto}`}
        >
          −
        </Button>
        <span className={cn('w-4 text-center text-sm tabular-nums', cant > 0 && 'font-semibold text-primary')}>
          {cant}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 w-7"
          onClick={onMas}
          aria-label={`Agregar ${producto.nombre_producto}`}
        >
          +
        </Button>
      </div>
    </li>
  )
}
