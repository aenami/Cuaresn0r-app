import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, Boxes, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { esGlobal, puedeEntradaPanaderia } from '@/lib/acceso'
import { errorApi } from '@/features/billing/caja-comun'
import { api } from '@/lib/api'
import { articulosQuery, bakeryApi, bakeryKeys } from './api'
import type { ArticuloPanaderia, TipoArticulo } from './api'

type Grupo = Extract<TipoArticulo, 'PANADERIA' | 'PASTELERIA' | 'EXTERNO'>
type Accion = 'entrada' | 'salida'
interface MovimientoProducto {
  id: number
  fecha: string
  tipo: string
  cantidad: string
  concepto: string
  existenciaAntes: string
  existenciaDespues: string
  usuario: { id_usuario: number; email_usuario: string } | null
}
const GRUPOS: { id: Grupo; nombre: string; descripcion: string }[] = [
  { id: 'PANADERIA', nombre: 'Panes', descripcion: 'Existencias y salidas de panes' },
  { id: 'PASTELERIA', nombre: 'Postres', descripcion: 'Existencias y salidas de postres' },
  { id: 'EXTERNO', nombre: 'Externos', descripcion: 'Bebidas y mercancía recibida' },
]

export function ProductosInventarioPanaderia() {
  const rol = useAuthStore((estado) => estado.usuario?.rolNombre)
  const queryClient = useQueryClient()
  const { data: articulos, isPending, error, refetch } = useQuery(articulosQuery)
  const [grupo, setGrupo] = useState<Grupo>('PANADERIA')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<ArticuloPanaderia | null>(null)
  const [accion, setAccion] = useState<Accion>('entrada')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const { data: movimientos, isPending: cargandoMovimientos, error: errorMovimientos } = useQuery({
    queryKey: [...bakeryKeys.articulos, seleccion?.id, 'movimientos'],
    queryFn: () => api.get<MovimientoProducto[]>(`/bakery/articulos/${seleccion!.id}/movimientos?limit=20`),
    enabled: seleccion !== null,
  })
  const termino = busqueda.trim().toLocaleLowerCase('es-CO')
  const productos = (articulos ?? []).filter((articulo) => articulo.tipo === grupo && articulo.nombre.toLocaleLowerCase('es-CO').includes(termino))
  const puedeMover = (articulo: ArticuloPanaderia) => articulo.activo && !esGlobal(rol) && puedeEntradaPanaderia(rol, articulo.tipo)
  const articuloActual = articulos?.find((articulo) => articulo.id === seleccion?.id) ?? seleccion
  const cantidadNumero = Number(cantidad)
  const cantidadValida = cantidad !== '' && Number.isInteger(cantidadNumero) && cantidadNumero > 0

  function iniciar(articulo: ArticuloPanaderia, proxima: Accion) {
    if (proxima === 'entrada' && articulo.tipo !== 'EXTERNO') return
    setSeleccion(articulo)
    setAccion(proxima)
    setCantidad('')
    setMotivo('')
  }

  async function registrar() {
    if (!seleccion || guardando || !puedeMover(seleccion) || !cantidadValida || !motivo.trim() || (accion === 'entrada' && seleccion.tipo !== 'EXTERNO')) return
    setGuardando(true)
    try {
      const datos = { cantidad: cantidadNumero, concepto: motivo.trim() }
      if (accion === 'entrada') await bakeryApi.entrada(seleccion.id, datos)
      else await api.post(`/bakery/articulos/${seleccion.id}/salidas`, datos)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bakeryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['inventario', 'valoracion-rango'] }),
      ])
      toast.success(accion === 'entrada' ? 'Entrada registrada' : 'Salida justificada registrada')
      setCantidad('')
      setMotivo('')
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  return <section className="space-y-6" aria-label="Productos de panadería">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl font-semibold uppercase">Productos de panadería</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Las hornadas de panes y postres se registran en Producción, donde suman existencias y consumen insumos de la receta. Aquí se reciben productos externos y se documentan salidas manuales, separadas de las ventas.</p>
      </div>
      <Link to="/produccion" className="inline-flex items-center gap-1.5 rounded-md bg-surface-high px-3 py-2 text-sm font-semibold text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Ir a Producción <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Familias de productos">
      {GRUPOS.map((opcion) => <button key={opcion.id} type="button" aria-pressed={grupo === opcion.id} onClick={() => { setGrupo(opcion.id); setSeleccion(null) }}
        className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', grupo === opcion.id ? 'bg-surface-high text-primary' : 'bg-surface-low text-muted-foreground hover:text-foreground')}>
        {opcion.nombre}
      </button>)}
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="text-sm text-muted-foreground">{GRUPOS.find((opcion) => opcion.id === grupo)?.descripcion}</p>
      <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar producto en inventario" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar producto…" className="pl-10" /></div>
    </div>

    {seleccion ? <section className="space-y-4 rounded-xl bg-surface-high p-5" aria-labelledby="movimiento-producto-titulo">
      <div><h3 id="movimiento-producto-titulo" className="font-heading text-lg font-semibold">{accion === 'entrada' ? 'Recibir mercancía' : 'Registrar salida'} · {seleccion.nombre}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Existencia actual: {formatearCantidad(articuloActual?.existencia ?? seleccion.existencia)} {seleccion.unidad}. {accion === 'salida' ? 'La salida no se registrará como venta.' : 'Indica el origen o proveedor de esta recepción.'}</p></div>
      <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <div><Label htmlFor="producto-movimiento-cantidad">Cantidad</Label><Input id="producto-movimiento-cantidad" type="number" min={1} step={1} inputMode="numeric" value={cantidad} onChange={(evento) => setCantidad(evento.target.value)} className="mt-1.5" autoFocus /></div>
        <div><Label htmlFor="producto-movimiento-motivo">{accion === 'entrada' ? 'Concepto de entrada' : 'Motivo de salida'}</Label><Input id="producto-movimiento-motivo" value={motivo} maxLength={200} onChange={(evento) => setMotivo(evento.target.value)} placeholder={accion === 'entrada' ? 'Ej. proveedor y factura' : 'Ej. consumo interno, daño o cortesía'} className="mt-1.5" /></div>
      </div>
      {accion === 'salida' && cantidadValida && cantidadNumero > Number(articuloActual?.existencia ?? seleccion.existencia) ? <p role="alert" className="text-sm text-destructive">La cantidad supera la existencia actual.</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={guardando || !cantidadValida || !motivo.trim() || (accion === 'salida' && cantidadNumero > Number(articuloActual?.existencia ?? seleccion.existencia))} onClick={() => void registrar()}>{guardando ? 'Guardando…' : accion === 'entrada' ? 'Registrar entrada' : 'Confirmar salida'}</Button><Button type="button" variant="ghost" onClick={() => setSeleccion(null)}>Cerrar</Button></div>
      <div className="border-t border-border pt-4"><h4 className="text-sm font-semibold">Movimientos recientes</h4>
        {cargandoMovimientos ? <p className="mt-2 text-sm text-muted-foreground">Cargando movimientos…</p> : errorMovimientos ? <p role="alert" className="mt-2 text-sm text-destructive">No se pudo consultar el historial: {errorApi(errorMovimientos)}</p>
          : !movimientos?.length ? <p className="mt-2 text-sm text-muted-foreground">Este artículo todavía no tiene movimientos registrados.</p>
            : <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">{movimientos.map((movimiento) => {
              const delta = Number(movimiento.existenciaDespues) - Number(movimiento.existenciaAntes)
              return <li key={movimiento.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface-low p-3 text-sm">
                <div><p className="font-medium">{movimiento.tipo === 'SALIDA_MANUAL' ? 'Salida justificada' : movimiento.tipo === 'PRODUCCION' ? 'Hornada' : movimiento.tipo === 'RECEPCION' ? 'Recepción' : movimiento.tipo === 'VENTA' ? 'Venta' : movimiento.tipo === 'MERMA' ? 'Merma' : movimiento.tipo === 'TRANSFERENCIA' ? 'Remisión' : movimiento.tipo === 'CONSUMO_RECETA' ? 'Receta' : 'Ajuste'}</p><p className="text-xs text-muted-foreground">{movimiento.concepto || 'Sin concepto'} · {new Date(movimiento.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}</p></div>
                <span className={cn('font-heading font-semibold tabular-nums', delta < 0 ? 'text-tertiary' : 'text-emerald-300')}>{delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatearCantidad(Math.abs(delta))} {seleccion.unidad}</span>
              </li>
            })}</ul>}
      </div>
    </section> : null}

    {isPending ? <div className="h-40 animate-pulse rounded-xl bg-surface-low" /> : error ? <div role="alert" className="space-y-2 rounded-xl bg-surface-low p-5 text-sm"><p className="text-destructive">No se pudieron consultar las existencias: {errorApi(error)}</p><Button variant="secondary" size="sm" onClick={() => void refetch()}>Reintentar</Button></div>
      : productos.length === 0 ? <div className="rounded-xl bg-surface-low p-8 text-center"><Boxes className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">{termino ? 'No hay coincidencias' : `Aún no hay ${GRUPOS.find((opcion) => opcion.id === grupo)?.nombre.toLowerCase()}`}</p><p className="mt-1 text-sm text-muted-foreground">Los artículos se crean en Catálogo de panadería; el inventario registra sus movimientos.</p></div>
        : <ul className="grid gap-3 lg:grid-cols-2">
          {productos.map((articulo) => <li key={articulo.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-low p-4">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-base font-semibold">{articulo.nombre}</h3>{!articulo.activo ? <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-xs text-tertiary">Inactivo</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{formatearPrecio(articulo.precioVenta)} por unidad</p></div>
            <div className="flex flex-wrap items-center gap-3"><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Existencia</p><p className="font-heading text-xl font-semibold tabular-nums">{formatearCantidad(articulo.existencia)}</p></div>
              {puedeMover(articulo) ? <div className="flex gap-1">{grupo === 'EXTERNO' ? <Button type="button" size="sm" variant="secondary" onClick={() => iniciar(articulo, 'entrada')}><ArrowDownToLine className="size-4" /> Recibir</Button> : null}<Button type="button" size="sm" variant="ghost" onClick={() => iniciar(articulo, 'salida')}><ArrowUpFromLine className="size-4" /> Salida</Button></div> : null}
            </div>
          </li>)}
        </ul>}
  </section>
}
