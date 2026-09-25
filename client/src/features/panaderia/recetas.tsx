import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, SquarePen, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatearCantidad } from '@/lib/formato'
import { errorApi } from '@/features/billing/caja-comun'
import { articulosQuery, bakeryApi, bakeryKeys, recetasPanaderiaQuery } from './api'
import type { RecetaPanaderia } from './api'

type Linea = { insumoId: string; cantidadUnidad: string }

export function RecetasPanaderia({ esAdmin }: { esAdmin: boolean }) {
  const queryClient = useQueryClient()
  const { data: articulos, isPending: cargandoArticulos, isError: errorArticulos } = useQuery(articulosQuery)
  const { data: recetas, isPending: cargandoRecetas, isError: errorRecetas } = useQuery(recetasPanaderiaQuery)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<RecetaPanaderia | null>(null)
  const [formulario, setFormulario] = useState(false)
  const [articuloId, setArticuloId] = useState('')
  const [nombre, setNombre] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([{ insumoId: '', cantidadUnidad: '' }])
  const [guardando, setGuardando] = useState(false)
  const productos = articulos?.filter((a) => a.tipo === 'PANADERIA' && a.activo) ?? []
  const insumos = articulos?.filter((a) => a.tipo === 'INSUMO' && a.activo) ?? []
  const visibles = recetas?.filter((receta) => `${receta.articulo.nombre} ${receta.nombre}`.toLowerCase().includes(busqueda.trim().toLowerCase())) ?? []

  function abrir(receta: RecetaPanaderia | null) {
    setEditando(receta)
    setArticuloId(receta ? String(receta.articuloId) : '')
    setNombre(receta?.nombre ?? '')
    setLineas(receta ? receta.detalles.map((d) => ({ insumoId: String(d.insumoId), cantidadUnidad: d.cantidadUnidad })) : [{ insumoId: '', cantidadUnidad: '' }])
    setFormulario(true)
  }

  async function guardar() {
    const cantidadesValidas = lineas.every((linea) => {
      const insumo = insumos.find((item) => item.id === Number(linea.insumoId))
      const cantidad = Number(linea.cantidadUnidad)
      return insumo && Number.isFinite(cantidad) && cantidad > 0 && (insumo.unidad !== 'UNIDADES' || Number.isInteger(cantidad))
    })
    if (!articuloId || !nombre.trim() || lineas.length === 0 || !cantidadesValidas || new Set(lineas.map((l) => l.insumoId)).size !== lineas.length) {
      toast.error('Elige un producto y agrega insumos con cantidades válidas, sin repetirlos.')
      return
    }
    setGuardando(true)
    try {
      await bakeryApi.crearReceta({ articuloId: Number(articuloId), nombre: nombre.trim(), detalles: lineas.map((linea) => ({ insumoId: Number(linea.insumoId), cantidadUnidad: Number(linea.cantidadUnidad) })) })
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.recetas })
      setFormulario(false)
      toast.success(editando ? 'Nueva versión de receta guardada' : 'Receta creada')
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  async function desactivar(receta: RecetaPanaderia) {
    if (!window.confirm(`¿Desactivar la receta de ${receta.articulo.nombre}? No podrás registrar nuevas hornadas hasta crear otra.`)) return
    setGuardando(true)
    try {
      await bakeryApi.desactivarReceta(receta.id)
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.recetas })
      toast.success('Receta desactivada')
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  if (cargandoArticulos || cargandoRecetas) return <div className="h-48 animate-pulse rounded-lg bg-surface-high" />
  if (errorArticulos || errorRecetas) return <p role="alert" className="text-sm text-destructive">No se pudieron cargar las recetas de panadería.</p>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="font-heading text-xl font-semibold uppercase">Recetas de panadería</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Define insumos por unidad de pan. Al registrar una hornada se descuentan automáticamente de las existencias de panadería.</p></div>
      {esAdmin && <Button size="sm" onClick={() => abrir(null)}><Plus className="mr-1 size-4" /> Nueva receta</Button>}
    </div>

    {formulario && esAdmin && <section className="space-y-4 rounded-lg bg-surface-high p-5" aria-label={editando ? 'Editar receta' : 'Nueva receta'}>
      <h3 className="font-heading text-lg font-semibold uppercase">{editando ? 'Nueva versión de receta' : 'Nueva receta'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="receta-pan-producto">Producto horneado</Label><Select value={articuloId} onValueChange={setArticuloId} disabled={!!editando}><SelectTrigger id="receta-pan-producto"><SelectValue placeholder="Selecciona un producto" /></SelectTrigger><SelectContent>{productos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="receta-pan-nombre">Nombre de receta</Label><Input id="receta-pan-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Pan francés" /></div>
      </div>
      <div className="space-y-2"><p className="text-sm font-semibold">Insumos por unidad de producto</p>
        {lineas.map((linea, indice) => {
          const insumo = insumos.find((item) => item.id === Number(linea.insumoId))
          return <div key={indice} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
            <div><Label htmlFor={`receta-pan-insumo-${indice}`}>Insumo {indice + 1}</Label><Select value={linea.insumoId} onValueChange={(valor) => setLineas((actual) => actual.map((l, i) => i === indice ? { ...l, insumoId: valor } : l))}><SelectTrigger id={`receta-pan-insumo-${indice}`}><SelectValue placeholder="Selecciona un insumo" /></SelectTrigger><SelectContent>{insumos.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.nombre} · {i.unidad}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor={`receta-pan-cantidad-${indice}`}>Cantidad {insumo?.unidad ?? ''}</Label><Input id={`receta-pan-cantidad-${indice}`} type="number" min={insumo?.unidad === 'UNIDADES' ? 1 : 0.0001} step={insumo?.unidad === 'UNIDADES' ? 1 : 0.0001} value={linea.cantidadUnidad} onChange={(e) => setLineas((actual) => actual.map((l, i) => i === indice ? { ...l, cantidadUnidad: e.target.value } : l))} /></div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Quitar insumo ${indice + 1}`} disabled={lineas.length === 1} onClick={() => setLineas((actual) => actual.filter((_, i) => i !== indice))}><Trash2 className="size-4" /></Button>
          </div>
        })}
        <Button type="button" size="sm" variant="secondary" disabled={lineas.length >= insumos.length} onClick={() => setLineas((actual) => [...actual, { insumoId: '', cantidadUnidad: '' }])}>Agregar insumo</Button>
      </div>
      {insumos.length === 0 && <p className="text-sm text-tertiary">Primero crea ingredientes en la pestaña Ingredientes.</p>}
      <div className="flex gap-2"><Button disabled={guardando || insumos.length === 0} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar receta'}</Button><Button variant="ghost" onClick={() => setFormulario(false)}>Cancelar</Button></div>
    </section>}

    <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar receta…" className="pl-10" /></div>
    {visibles.length === 0 ? <p className="rounded-lg bg-surface-high p-6 text-sm text-muted-foreground">{busqueda ? 'Ninguna receta coincide con la búsqueda.' : 'Aún no hay recetas activas de panadería.'}</p>
      : <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibles.map((receta) => <li key={receta.id} className="flex flex-col rounded-lg bg-surface-high p-5">
        <div><h3 className="font-heading text-lg font-semibold uppercase">{receta.articulo.nombre}</h3><p className="mt-1 text-sm text-muted-foreground">{receta.nombre} · versión #{receta.id}</p></div>
        <ul className="my-4 flex-1 space-y-2 border-t border-border pt-4">{receta.detalles.map((d) => <li key={d.id} className="flex justify-between gap-3 text-sm"><span>{d.insumo.nombre}</span><strong className="tabular-nums">{formatearCantidad(d.cantidadUnidad)} {d.insumo.unidad}</strong></li>)}</ul>
        {esAdmin && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => abrir(receta)}><SquarePen className="mr-1 size-4" /> Editar</Button><Button size="sm" variant="ghost" disabled={guardando} onClick={() => void desactivar(receta)}>Desactivar</Button></div>}
      </li>)}</ul>}
  </div>
}
