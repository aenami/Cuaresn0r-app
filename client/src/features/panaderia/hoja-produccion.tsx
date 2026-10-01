import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Croissant,
  LockKeyhole,
  PackagePlus,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorApi } from '@/features/billing/caja-comun'
import { articulosQuery, bakeryKeys, categoriasPanaderiaQuery, recetasPanaderiaQuery } from './api'
import { hojasProduccionApi, hojasProduccionFechaQuery, hojasProduccionKeys } from './produccion-api'
import type { EntradaHojaProduccion, FamiliaProduccion, HojaProduccion } from './produccion-api'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'

const FAMILIAS: { id: FamiliaProduccion; nombre: string; singular: string; descripcion: string }[] = [
  { id: 'PANADERIA', nombre: 'Panes', singular: 'pan', descripcion: 'Horneadas registradas' },
  { id: 'PASTELERIA', nombre: 'Postres', singular: 'postre', descripcion: 'Preparaciones de pastelería' },
]

function hoyColombia() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function moverDia(fecha: string, delta: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + delta, 12)).toISOString().slice(0, 10)
}

function fechaLarga(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`))
}

function nombrePanadero(hoja: HojaProduccion) {
  const empleado = hoja.panadero?.empleado
  return empleado
    ? `${empleado.nombre_empleado} ${empleado.apellido_empleado}`.trim()
    : hoja.panadero?.email_usuario ?? `Panadero #${hoja.panaderoId}`
}

function fechaHora(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function HojaProduccionPanaderia() {
  const usuario = useAuthStore((estado) => estado.usuario)
  const esPanadero = usuario?.rolNombre === 'PANADERO'
  const [fecha, setFecha] = useState(hoyColombia)
  const [hojaSeleccionadaId, setHojaSeleccionadaId] = useState<number | null>(null)
  const [grupo, setGrupo] = useState<FamiliaProduccion>('PANADERIA')
  const [articuloId, setArticuloId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [claveOperacion, setClaveOperacion] = useState(() => crypto.randomUUID())
  const [guardando, setGuardando] = useState(false)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const queryClient = useQueryClient()
  const esHoy = fecha === hoyColombia()
  const { data: hojas, isPending, error, refetch } = useQuery(hojasProduccionFechaQuery(fecha, esHoy))
  const articulosConsulta = useQuery(articulosQuery)
  const categoriasConsulta = useQuery(categoriasPanaderiaQuery)
  const recetasConsulta = useQuery(recetasPanaderiaQuery)
  const articulos = articulosConsulta.data
  const categorias = categoriasConsulta.data
  const recetas = recetasConsulta.data
  const cargandoCatalogo = articulosConsulta.isPending || categoriasConsulta.isPending || recetasConsulta.isPending
  const errorCatalogo = articulosConsulta.isError || categoriasConsulta.isError || recetasConsulta.isError
  const hoja = hojas?.find((item) => item.id === hojaSeleccionadaId) ?? hojas?.[0] ?? null
  const puedeRegistrar = esPanadero && esHoy && (!hoja || hoja.estado === 'BORRADOR')
  const elegibles = (articulos ?? []).filter((articulo) =>
    articulo.activo && articulo.categoriaId !== null &&
    categorias?.some((categoria) => categoria.id === articulo.categoriaId && categoria.activa && categoria.tipo === articulo.tipo),
  )
  const opciones = elegibles.filter((articulo) => articulo.tipo === grupo)
  const articulo = opciones.find((item) => item.id === Number(articuloId))
  const tieneReceta = !!recetas?.some((receta) => receta.articuloId === articulo?.id && receta.activa)
  const cantidadNumero = Number(cantidad)
  const cantidadValida = cantidad !== '' && Number.isInteger(cantidadNumero) && cantidadNumero > 0

  function cambiarGrupo(siguiente: FamiliaProduccion) {
    setGrupo(siguiente)
    setArticuloId('')
    setCantidad('')
    setClaveOperacion(crypto.randomUUID())
  }

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!puedeRegistrar || !articulo || !tieneReceta || !cantidadValida || guardando) return
    setGuardando(true)
    try {
      const actualizada = await hojasProduccionApi.registrar({
        articuloId: articulo.id,
        cantidad: cantidadNumero,
        claveOperacion,
      })
      setHojaSeleccionadaId(actualizada.id)
      setArticuloId('')
      setCantidad('')
      setClaveOperacion(crypto.randomUUID())
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: hojasProduccionKeys.all }),
        queryClient.invalidateQueries({ queryKey: bakeryKeys.all }),
      ])
      toast.success('Producción registrada y existencias actualizadas')
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setGuardando(false)
    }
  }

  async function finalizar() {
    if (!hoja || !puedeRegistrar || !confirmandoCierre || cerrando) return
    setCerrando(true)
    try {
      await hojasProduccionApi.finalizar(hoja.id)
      await queryClient.invalidateQueries({ queryKey: hojasProduccionKeys.all })
      setConfirmandoCierre(false)
      toast.success('Hoja finalizada. El informe quedó disponible para consulta.')
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setCerrando(false)
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="micro-label flex items-center gap-2 text-primary"><ClipboardList className="size-4" /> Panadería · producción</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold uppercase tracking-tighter">Hoja de producción</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {esPanadero
            ? 'Registra panes y postres a medida que los preparas. Cada registro suma producto y descuenta los insumos de su receta.'
            : 'Consulta el avance de cada panadero durante el día y revisa sus informes finalizados.'}
        </p>
      </div>
      <Link to="/inventario" className="text-sm font-semibold text-primary hover:underline">Ver inventario y metas →</Link>
    </header>

    <section className="rounded-xl bg-surface-low p-4 sm:p-5" aria-label="Fecha de la producción">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="micro-label">Jornada consultada</p>
          <h2 className="mt-1 font-heading text-xl font-semibold capitalize">{fechaLarga(fecha)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="size-10 px-0" aria-label="Día anterior" onClick={() => { setFecha((actual) => moverDia(actual, -1)); setHojaSeleccionadaId(null) }}><ChevronLeft className="size-4" /></Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" aria-label="Fecha de producción" value={fecha} max={hoyColombia()} onChange={(evento) => { setFecha(evento.target.value || hoyColombia()); setHojaSeleccionadaId(null) }} className="h-10 w-44 bg-surface-high pl-9" />
          </div>
          <Button type="button" size="sm" variant="secondary" className="size-10 px-0" aria-label="Día siguiente" disabled={esHoy} onClick={() => { setFecha((actual) => moverDia(actual, 1)); setHojaSeleccionadaId(null) }}><ChevronRight className="size-4" /></Button>
          {!esHoy ? <Button type="button" size="sm" variant="ghost" onClick={() => { setFecha(hoyColombia()); setHojaSeleccionadaId(null) }}>Hoy</Button> : null}
        </div>
      </div>
    </section>

    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm"><p>No se pudieron consultar las hojas: {errorApi(error)}</p><Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}><RotateCcw className="size-4" /> Reintentar</Button></div> : null}
    {isPending ? <div role="status" className="h-48 animate-pulse rounded-xl bg-surface-low" aria-label="Cargando hojas de producción" /> : null}

    {!isPending && !error ? <>
      {!esPanadero && (hojas?.length ?? 0) > 0 ? <section aria-label="Hojas por panadero" className="rounded-xl bg-surface-low p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-heading text-lg font-semibold">Panaderos del día</h2><span className="micro-label">{hojas?.length} {hojas?.length === 1 ? 'hoja' : 'hojas'}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">{hojas?.map((item) => <button key={item.id} type="button" aria-pressed={hoja?.id === item.id} onClick={() => setHojaSeleccionadaId(item.id)} className={cn('rounded-lg border px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', hoja?.id === item.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-high hover:border-primary/50')}>
          <span className="block font-semibold">{nombrePanadero(item)}</span>
          <span className="mt-0.5 block text-xs opacity-75">{item.estado === 'FINALIZADA' ? 'Informe finalizado' : 'En curso'} · {formatearCantidad(item.resumen.cantidadTotal)} {Number(item.resumen.cantidadTotal) === 1 ? 'unidad' : 'unidades'}</span>
        </button>)}</div>
      </section> : null}

      {puedeRegistrar ? <section className="rounded-xl border border-primary/20 bg-surface-low p-5 sm:p-6" aria-labelledby="registro-produccion-titulo">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="micro-label text-primary">Registro de jornada</p><h2 id="registro-produccion-titulo" className="mt-1 font-heading text-xl font-semibold">Agregar producción</h2><p className="mt-1 text-sm text-muted-foreground">Selecciona un producto ya creado, indica la cantidad completa y regístralo una sola vez.</p></div>
          <span className="rounded-md border border-tertiary/40 bg-tertiary/10 px-2.5 py-1 text-xs font-semibold text-tertiary">Hoja en curso</span>
        </div>
        <div role="group" aria-label="Familia a producir" className="mt-5 grid gap-2 sm:grid-cols-2">
          {FAMILIAS.map((familia) => <button key={familia.id} type="button" aria-pressed={grupo === familia.id} onClick={() => cambiarGrupo(familia.id)} className={cn('flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', grupo === familia.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-high text-muted-foreground hover:text-foreground')}><span className="flex items-center gap-2 font-semibold"><Croissant className="size-4" /> {familia.nombre}</span><span className="text-xs">{cargandoCatalogo ? 'Cargando…' : `${elegibles.filter((item) => item.tipo === familia.id).length} disponibles`}</span></button>)}
        </div>
        <form onSubmit={(evento) => void registrar(evento)} className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem_auto] md:items-end">
          <div><Label htmlFor="produccion-articulo">{grupo === 'PANADERIA' ? 'Pan' : 'Postre'}</Label><Select value={articuloId} disabled={cargandoCatalogo || errorCatalogo || opciones.length === 0} onValueChange={(valor) => { setArticuloId(valor); setClaveOperacion(crypto.randomUUID()) }}><SelectTrigger id="produccion-articulo" className="mt-1.5 w-full"><SelectValue placeholder={cargandoCatalogo ? 'Cargando productos…' : `Selecciona un ${grupo === 'PANADERIA' ? 'pan' : 'postre'}`} /></SelectTrigger><SelectContent>{opciones.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.nombre} · {formatearPrecio(item.precioVenta)}</SelectItem>)}</SelectContent></Select>{!cargandoCatalogo && !errorCatalogo && opciones.length === 0 ? <p className="mt-1.5 text-xs text-muted-foreground">No hay productos activos con categoría en esta familia.</p> : null}</div>
          <div><Label htmlFor="produccion-cantidad">Cantidad</Label><Input id="produccion-cantidad" type="number" min={1} step={1} inputMode="numeric" value={cantidad} onChange={(evento) => { setCantidad(evento.target.value); setClaveOperacion(crypto.randomUUID()) }} placeholder="Ej. 24" className="mt-1.5 tabular-nums" /></div>
          <Button type="submit" className="btn-heat" disabled={guardando || !articulo || !cantidadValida || !tieneReceta}><Plus className="size-4" /> {guardando ? 'Registrando…' : 'Registrar'}</Button>
        </form>
        {errorCatalogo ? <p role="alert" className="mt-3 text-sm text-destructive">No se pudo consultar el catálogo o las recetas. <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { void articulosConsulta.refetch(); void categoriasConsulta.refetch(); void recetasConsulta.refetch() }}>Reintentar</button></p> : null}
        {articulo && !tieneReceta ? <p role="alert" className="mt-3 text-sm text-tertiary">{articulo.nombre} necesita una receta activa en Inventario → Recetas antes de poder producirlo.</p> : null}
        {articulo && tieneReceta && cantidadValida ? <p className="mt-3 text-sm text-muted-foreground">Se ingresarán <strong className="text-foreground">{formatearCantidad(cantidadNumero)} {cantidadNumero === 1 ? 'unidad' : 'unidades'}</strong> de {articulo.nombre}; valor de catálogo estimado: <strong className="text-foreground">{formatearPrecio(cantidadNumero * Number(articulo.precioVenta))}</strong>.</p> : null}
      </section> : null}

      {esPanadero && hoja?.estado === 'FINALIZADA' ? <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-300"><LockKeyhole className="size-5 shrink-0" /> Tu hoja quedó finalizada. Para esta fecha ya no se pueden agregar productos.</div> : null}
      {esPanadero && !esHoy ? <p className="rounded-xl bg-surface-low p-4 text-sm text-muted-foreground">Estás consultando un día anterior. Solo puedes registrar producción en la jornada de hoy.</p> : null}

      {hoja ? <>
        <section className="overflow-hidden rounded-xl bg-surface-low" aria-labelledby="informe-produccion-titulo">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div><p className="micro-label text-primary">{hoja.estado === 'FINALIZADA' ? 'Informe de producción' : 'Avance en vivo'}</p><h2 id="informe-produccion-titulo" className="mt-1 font-heading text-2xl font-semibold">{nombrePanadero(hoja)}</h2><p className="mt-1 text-sm text-muted-foreground">{fechaLarga(fecha)}{hoja.fechaFinalizacion ? ` · Finalizada ${fechaHora(hoja.fechaFinalizacion)}` : ' · Pendiente de cierre'}</p></div>
            <span className={cn('rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wide', hoja.estado === 'FINALIZADA' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : 'border-tertiary/40 bg-tertiary/10 text-tertiary')}>{hoja.estado === 'FINALIZADA' ? 'Finalizada' : 'En curso'}</span>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <IndicadorReporte etiqueta="Panes" cantidad={hoja.resumen.PANADERIA.cantidad} valor={hoja.resumen.PANADERIA.valor} />
            <IndicadorReporte etiqueta="Postres" cantidad={hoja.resumen.PASTELERIA.cantidad} valor={hoja.resumen.PASTELERIA.valor} />
            <div className="bg-surface-high p-5"><p className="micro-label text-primary">Valor total de catálogo</p><p className="mt-2 font-heading text-3xl font-semibold tabular-nums text-primary">{formatearPrecio(hoja.resumen.valorTotal)}</p><p className="mt-1 text-xs text-muted-foreground">{formatearCantidad(hoja.resumen.cantidadTotal)} {Number(hoja.resumen.cantidadTotal) === 1 ? 'unidad producida' : 'unidades producidas'}</p></div>
          </div>
          <div className="space-y-8 p-5 sm:p-6">{FAMILIAS.map((familia) => <GrupoReporte key={familia.id} familia={familia} entradas={hoja.entradas.filter((entrada) => entrada.tipoSnapshot === familia.id)} valor={hoja.resumen[familia.id].valor} />)}</div>
        </section>

        {esPanadero && esHoy && hoja.estado === 'BORRADOR' && hoja.entradas.length > 0 ? <section className="rounded-xl border border-border bg-surface-low p-5" aria-label="Finalizar hoja de producción">
          {!confirmandoCierre ? <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-semibold">¿Terminaste la jornada?</h2><p className="mt-1 text-sm text-muted-foreground">Verifica las cantidades y después cierra tu hoja. El cierre no cambia de nuevo las existencias.</p></div><Button type="button" variant="secondary" onClick={() => setConfirmandoCierre(true)}><Check className="size-4" /> Revisar y finalizar</Button></div>
            : <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-semibold">Confirmar cierre</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">La hoja quedará bloqueada con {formatearCantidad(hoja.resumen.cantidadTotal)} unidades por {formatearPrecio(hoja.resumen.valorTotal)}. No podrás agregar más registros a esta jornada.</p></div><div className="flex gap-2"><Button type="button" variant="ghost" disabled={cerrando} onClick={() => setConfirmandoCierre(false)}>Seguir editando</Button><Button type="button" className="btn-heat" disabled={cerrando} onClick={() => void finalizar()}>{cerrando ? 'Finalizando…' : 'Finalizar hoja'}</Button></div></div>}
        </section> : null}
      </> : <div className="rounded-xl border border-dashed border-border bg-surface-low p-10 text-center"><PackagePlus className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-heading text-lg font-semibold">Sin producción registrada para este día</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{esPanadero && esHoy ? 'Elige un pan o postre arriba para comenzar tu hoja.' : 'Cuando un panadero registre su primera preparación, podrás consultar el avance aquí.'}</p></div>}
    </> : null}
  </div>
}

function IndicadorReporte({ etiqueta, cantidad, valor }: { etiqueta: string; cantidad: string; valor: string }) {
  return <div className="bg-surface-high p-5"><p className="micro-label">{etiqueta}</p><p className="mt-2 font-heading text-3xl font-semibold tabular-nums">{formatearCantidad(cantidad)}</p><p className="mt-1 text-sm text-muted-foreground">{formatearPrecio(valor)} en catálogo</p></div>
}

function GrupoReporte({ familia, entradas, valor }: {
  familia: (typeof FAMILIAS)[number]
  entradas: EntradaHojaProduccion[]
  valor: string
}) {
  return <section aria-label={`Producción de ${familia.nombre.toLowerCase()}`}>
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3"><div><p className="micro-label text-primary">{familia.nombre}</p><h3 className="mt-1 font-heading text-lg font-semibold">{familia.descripcion}</h3></div><p className="font-heading text-lg font-semibold tabular-nums">{formatearPrecio(valor)}</p></div>
    {entradas.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Aún no hay {familia.nombre.toLowerCase()} registrados.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th scope="col" className="py-3 pr-4 font-semibold">Producto / registro</th><th scope="col" className="px-3 py-3 text-right font-semibold">Cantidad</th><th scope="col" className="px-3 py-3 text-right font-semibold">Precio unitario</th><th scope="col" className="py-3 pl-3 text-right font-semibold">Valor</th></tr></thead><tbody>{entradas.map((entrada) => <tr key={entrada.id} className="border-t border-border/60"><td className="py-3 pr-4"><p className="font-medium">{entrada.nombreArticuloSnapshot}</p><p className="text-xs text-muted-foreground">{fechaHora(entrada.fechaRegistro)}</p></td><td className="px-3 py-3 text-right tabular-nums">{formatearCantidad(entrada.cantidad)}</td><td className="px-3 py-3 text-right tabular-nums">{formatearPrecio(entrada.precioUnitarioSnapshot)}</td><td className="py-3 pl-3 text-right font-semibold tabular-nums">{formatearPrecio(entrada.subtotal)}</td></tr>)}</tbody></table></div>}
  </section>
}
