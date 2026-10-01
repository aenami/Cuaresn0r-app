import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Plus, Scale, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { formatearCantidad } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { errorApi } from '@/features/billing/caja-comun'
import { ValoracionDelConteo } from '@/features/inventario/valoracion-conteo'
import { articulosQuery, bakeryApi, bakeryKeys, conteoPorFechaQuery } from './api'
import type { ArticuloPanaderia, ConteoPanaderia, EstadoConteoPanaderia } from './api'

interface ElementoListaConteo {
  id: number
  articuloId: number
  activo: boolean
  fechaInicio: string
  articulo: ArticuloPanaderia
}

const listaConteoQuery = {
  queryKey: [...bakeryKeys.conteo, 'lista'] as const,
  queryFn: () => api.get<ElementoListaConteo[]>('/bakery/conteo/lista'),
}

function hoyColombia() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function moverFecha(fecha: string, dias: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function nombreTipo(articulo: ArticuloPanaderia) {
  return articulo.tipo === 'INSUMO' ? 'Ingrediente'
    : articulo.tipo === 'PANADERIA' ? 'Panadería'
      : articulo.tipo === 'PASTELERIA' ? 'Pastelería' : 'Externo'
}

export function ConteoDiarioPanaderia({ esAdmin, soloLectura }: { esAdmin: boolean; soloLectura: boolean }) {
  const [fecha, setFecha] = useState(hoyColombia)
  const [configurando, setConfigurando] = useState(false)
  const hoy = hoyColombia()
  const esHoy = fecha === hoy
  const esPasado = fecha < hoy
  const esFuturo = fecha > hoy
  const { data: estado, isPending, error } = useQuery(conteoPorFechaQuery(fecha, esHoy))
  const { data: lista, isPending: cargandoLista, error: errorLista } = useQuery(listaConteoQuery)

  const conteos = new Map((estado?.detalle ?? []).map((conteo) => [conteo.articuloId, conteo]))
  const proyecciones = new Map((estado?.proyeccion ?? []).map((fila) => [fila.articuloId, fila]))
  const articulos = esPasado
    ? (estado?.detalle ?? []).map((conteo) => conteo.articulo)
    : (lista ?? []).filter((elemento) => elemento.articulo.activo).map((elemento) => elemento.articulo)
  // Un conteo confirmado hoy sigue visible aunque se retire de la lista fija.
  if (esHoy) for (const conteo of estado?.detalle ?? []) {
    if (!articulos.some((articulo) => articulo.id === conteo.articuloId)) articulos.push(conteo.articulo)
  }

  const pendientes = esHoy ? estado?.faltantes.length ?? 0 : 0
  const porRecontar = esHoy ? estado?.recontar.length ?? 0 : 0
  const confirmados = articulos.filter((articulo) => conteos.has(articulo.id)).length

  return <div className="space-y-6">
    <section className="rounded-xl bg-surface-low p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold uppercase"><Scale className="size-5 text-primary" /> Conteo diario de panadería</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Cuenta solo los productos e ingredientes definidos en la lista fija. Las ventas y salidas justificadas se comparan con lo que queda físicamente.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="fecha-conteo-pan" className="mb-1.5 flex items-center gap-1.5 text-xs"><CalendarDays className="size-3.5" /> Fecha</Label>
            <Input id="fecha-conteo-pan" type="date" value={fecha} onChange={(evento) => { if (/^\d{4}-\d{2}-\d{2}$/.test(evento.target.value)) setFecha(evento.target.value) }} className="w-40" />
          </div>
          <Button type="button" size="icon" variant="secondary" aria-label="Día anterior" onClick={() => setFecha(moverFecha(fecha, -1))}><ChevronLeft className="size-4" /></Button>
          <Button type="button" size="icon" variant="secondary" aria-label="Día siguiente" onClick={() => setFecha(moverFecha(fecha, 1))}><ChevronRight className="size-4" /></Button>
          {!esHoy ? <Button type="button" variant="ghost" size="sm" onClick={() => setFecha(hoy)}>Hoy</Button> : null}
          {esAdmin && !soloLectura && esHoy ? <Button type="button" className="btn-heat" onClick={() => setConfigurando(true)}><ClipboardList className="size-4" /> Configurar lista fija</Button> : null}
        </div>
      </div>
      <p className="mt-5 text-sm text-muted-foreground" role="status">
        {esPasado ? 'Historial guardado · solo lectura. Los cambios en la lista fija no alteran este día.'
          : esFuturo ? 'Vista previa de la lista fija actual · no se pueden ingresar cantidades para un día futuro.'
            : `${confirmados} contados · ${pendientes} pendientes${porRecontar ? ` · ${porRecontar} por recontar` : ''}`}
      </p>
    </section>

    {isPending || (!esPasado && cargandoLista) ? <div className="h-44 animate-pulse rounded-xl bg-surface-low" />
      : error || (!esPasado && errorLista) ? <p role="alert" className="rounded-xl bg-surface-low p-5 text-sm text-destructive">No se pudo consultar el conteo: {errorApi(error ?? errorLista)}</p>
        : articulos.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-surface-low p-8 text-center">
          <Scale className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-heading font-semibold">{esPasado ? 'No hubo conteos registrados este día' : 'La lista fija aún está vacía'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{esPasado ? 'Selecciona otra fecha para consultar su historial.' : 'El administrador puede añadir productos e ingredientes que ya existen en el catálogo e inventario.'}</p>
        </div> : <ul className="grid gap-3 xl:grid-cols-2">
          {articulos.map((articulo) => <TarjetaPanaderia key={articulo.id} articulo={articulo} conteo={esFuturo ? undefined : conteos.get(articulo.id)} proyeccion={esFuturo ? undefined : proyecciones.get(articulo.id)} esHoy={esHoy} esFuturo={esFuturo} soloLectura={soloLectura} />)}
        </ul>}

    {configurando ? <ConfigurarLista abierto={configurando} onCerrar={() => setConfigurando(false)} /> : null}
  </div>
}

function TarjetaPanaderia({ articulo, conteo, proyeccion, esHoy, esFuturo, soloLectura }: {
  articulo: ArticuloPanaderia
  conteo?: ConteoPanaderia
  proyeccion?: EstadoConteoPanaderia['proyeccion'][number]
  esHoy: boolean
  esFuturo: boolean
  soloLectura: boolean
}) {
  const [cantidad, setCantidad] = useState('')
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const queryClient = useQueryClient()
  const cantidadNumerica = Number(cantidad)
  const cantidadValida = cantidad !== '' && Number.isFinite(cantidadNumerica) && cantidadNumerica >= 0 && (articulo.unidad !== 'UNIDADES' || Number.isInteger(cantidadNumerica))
  const diferencia = conteo ? Number(conteo.conciliacion.diferenciaUnidades) : null
  const salidas = proyeccion?.salidasJustificadas ?? conteo?.salidasJustificadas ?? '0'

  async function confirmar() {
    if (!cantidadValida || guardando) return
    setGuardando(true)
    try {
      await bakeryApi.conteo(articulo.id, cantidadNumerica)
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.conteo })
      await queryClient.invalidateQueries({ queryKey: ['inventario', 'valoracion-rango'] })
      setCantidad('')
      setEditando(false)
      toast.success('Conteo físico guardado')
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  return <li className={cn('overflow-hidden rounded-xl border bg-surface-low', conteo ? 'border-emerald-400/25' : 'border-border')}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 p-4">
      <div className="min-w-0">
        <h3 className="font-heading text-lg font-semibold">{articulo.nombre}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{nombreTipo(articulo)} · {articulo.unidad}{!articulo.activo ? ' · Inactivo' : ''}</p>
      </div>
      <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', esFuturo ? 'bg-surface-high text-muted-foreground' : conteo ? 'bg-emerald-400/10 text-emerald-300' : 'bg-tertiary/10 text-tertiary')}>
        {esFuturo ? 'Programado' : conteo?.requiereReconteo ? 'Recontar' : conteo ? 'Contado' : 'Pendiente'}
      </span>
    </div>
    {!esFuturo ? <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-surface-high/45 p-4 text-sm sm:grid-cols-3">
      <Dato etiqueta="Saldo anterior" valor={proyeccion?.cantidadInicial ?? conteo?.cantidadInicial ?? null} unidad={articulo.unidad} />
      <Dato etiqueta="Entradas" valor={proyeccion?.entradas ?? conteo?.entradas ?? '0'} unidad={articulo.unidad} />
      <Dato etiqueta="Ventas POS" valor={proyeccion?.ventasRegistradas ?? conteo?.ventasRegistradas ?? '0'} unidad={articulo.unidad} />
      <Dato etiqueta="Salidas justificadas" valor={salidas} unidad={articulo.unidad} />
      <Dato etiqueta="Remisiones" valor={proyeccion?.transferencias ?? conteo?.transferencias ?? '0'} unidad={articulo.unidad} />
      <Dato etiqueta="Consumo receta" valor={proyeccion?.consumoReceta ?? conteo?.consumoReceta ?? '0'} unidad={articulo.unidad} />
      <Dato etiqueta="Mermas" valor={proyeccion?.mermas ?? conteo?.mermas ?? '0'} unidad={articulo.unidad} />
      <Dato etiqueta="Conteo físico" valor={conteo?.cantidadFisica ?? null} unidad={articulo.unidad} />
    </div> : <p className="p-4 text-sm text-muted-foreground">Se contará cuando llegue esta fecha.</p>}
    {conteo ? <div className="space-y-3 p-4">
      <p className={cn('text-sm font-medium', diferencia === 0 ? 'text-emerald-300' : 'text-rose-300')}>
        {conteo.requiereReconteo ? 'Hubo movimientos después del conteo; vuelve a contar.'
          : diferencia === 0 ? 'El conteo coincide con las salidas registradas.'
            : `${diferencia! > 0 ? 'Faltan' : 'Sobran'} ${formatearCantidad(Math.abs(diferencia!))} ${articulo.unidad} por revisar.`}
      </p>
      <ValoracionDelConteo valoracion={conteo.valoracion} pendiente={false} esIngrediente={articulo.tipo === 'INSUMO'} />
    </div> : null}
    {esHoy && !soloLectura ? <div className="border-t border-border/70 p-4">
      {editando ? <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1"><Label htmlFor={`conteo-pan-${articulo.id}`}>Cantidad física · {articulo.unidad}</Label><Input id={`conteo-pan-${articulo.id}`} type="number" min={0} step={articulo.unidad === 'UNIDADES' ? 1 : 0.0001} value={cantidad} onChange={(evento) => setCantidad(evento.target.value)} className="mt-1.5" autoFocus /></div>
        <Button type="button" disabled={!cantidadValida || guardando} onClick={() => void confirmar()}><Check className="size-4" /> {guardando ? 'Guardando…' : 'Confirmar'}</Button>
        <Button type="button" variant="ghost" onClick={() => { setCantidad(''); setEditando(false) }}>Cancelar</Button>
      </div> : <Button type="button" variant="secondary" size="sm" onClick={() => { setCantidad(conteo?.cantidadFisica ?? ''); setEditando(true) }}>{conteo ? 'Corregir conteo' : 'Ingresar conteo físico'}</Button>}
    </div> : null}
  </li>
}

function Dato({ etiqueta, valor, unidad }: { etiqueta: string; valor: string | number | null; unidad: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p><p className="mt-1 font-heading text-base font-semibold tabular-nums">{valor === null ? '—' : formatearCantidad(valor)} <span className="text-xs font-normal text-muted-foreground">{valor === null ? '' : unidad}</span></p></div>
}

function ConfigurarLista({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const queryClient = useQueryClient()
  const { data: articulos } = useQuery(articulosQuery)
  const { data: lista, isPending, error } = useQuery(listaConteoQuery)
  const [tipo, setTipo] = useState<'PRODUCTO' | 'INGREDIENTE'>('PRODUCTO')
  const [articuloId, setArticuloId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const opciones = (articulos ?? []).filter((articulo) => articulo.activo && (tipo === 'INGREDIENTE' ? articulo.tipo === 'INSUMO' : articulo.tipo !== 'INSUMO') && !(lista ?? []).some((elemento) => elemento.articuloId === articulo.id))

  async function actualizar(accion: () => Promise<unknown>, mensaje: string) {
    setGuardando(true)
    try {
      await accion()
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.conteo })
      setArticuloId('')
      toast.success(mensaje)
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  return <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar() }}>
    <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Lista fija del conteo diario</DialogTitle><DialogDescription>Selecciona productos e ingredientes ya creados. La lista de hoy se usará en los próximos días; retirar un elemento conserva sus conteos anteriores.</DialogDescription></DialogHeader>
      {isPending ? <p className="text-sm text-muted-foreground">Cargando lista…</p> : error ? <p role="alert" className="text-sm text-destructive">{errorApi(error)}</p>
        : <ul className="max-h-52 space-y-2 overflow-y-auto">
          {lista?.map((elemento) => <li key={elemento.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-high p-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{elemento.articulo.nombre}</p><p className="text-xs text-muted-foreground">{nombreTipo(elemento.articulo)} · {elemento.articulo.unidad}</p></div>
            <Button type="button" variant="ghost" size="sm" disabled={guardando} onClick={() => void actualizar(() => api.delete(`/bakery/conteo/lista/${elemento.id}`), 'Elemento retirado de la lista fija')}><Trash2 className="size-3" /> Retirar</Button>
          </li>)}
          {lista?.length === 0 ? <li className="text-sm text-muted-foreground">Aún no hay elementos configurados.</li> : null}
        </ul>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Tipo</Label><Select value={tipo} onValueChange={(valor) => { setTipo(valor as typeof tipo); setArticuloId('') }}><SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRODUCTO">Producto</SelectItem><SelectItem value="INGREDIENTE">Ingrediente</SelectItem></SelectContent></Select></div>
        <div><Label>Artículo existente</Label><Select value={articuloId} onValueChange={setArticuloId}><SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{opciones.map((articulo) => <SelectItem key={articulo.id} value={String(articulo.id)}>{articulo.nombre} · {nombreTipo(articulo)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {opciones.length === 0 ? <p className="text-xs text-muted-foreground">No hay más {tipo === 'PRODUCTO' ? 'productos' : 'ingredientes'} activos para agregar. Se crean en Catálogo o Inventario → Ingredientes.</p> : null}
      <Button type="button" className="btn-heat w-full" disabled={!articuloId || guardando || isPending || !!error} onClick={() => void actualizar(() => api.post('/bakery/conteo/lista', { articuloId: Number(articuloId) }), 'Elemento agregado a la lista fija')}><Plus className="size-4" /> Agregar elemento</Button>
    </DialogContent>
  </Dialog>
}
