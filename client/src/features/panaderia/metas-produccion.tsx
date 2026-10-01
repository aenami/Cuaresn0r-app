import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { articulosQuery, categoriasPanaderiaQuery } from './api'
import { ApiError } from '@/lib/api'
import { formatearCantidad } from '@/lib/formato'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'
import {
  metasProduccionPanaderiaApi,
  metasProduccionPanaderiaKeys,
  metasProduccionPanaderiaQuery,
} from './metas-produccion-api'
import type { EstadoMetaPanaderia, MetaProduccionPanaderia } from './metas-produccion-api'

const ESTADOS: Record<EstadoMetaPanaderia, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-tertiary/10 text-tertiary' },
  PRODUCIDO: { texto: 'Producido', clase: 'bg-emerald-400/10 text-emerald-300' },
  NO_PRODUCIDO: { texto: 'No producido', clase: 'bg-red-400/10 text-red-300' },
}

function fechaColombia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function desplazarFecha(fecha: string, dias: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function fechaLarga(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`))
}

function mensajeError(error: unknown) {
  return error instanceof ApiError ? error.message : 'No se pudo completar la operación. Intenta de nuevo.'
}

function nombreUsuario(usuario: MetaProduccionPanaderia['usuarioCrea']) {
  if (!usuario) return null
  return usuario.email_usuario
}

export function MetasProduccionPanaderia({ esAdmin, esGlobal }: { esAdmin: boolean; esGlobal: boolean }) {
  const [fecha, setFecha] = useState(fechaColombia)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [articuloId, setArticuloId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const rol = useAuthStore((estado) => estado.usuario?.rolNombre)
  const queryClient = useQueryClient()
  const metasQuery = useQuery(metasProduccionPanaderiaQuery(fecha))
  const articulosQueryResult = useQuery({ ...articulosQuery, enabled: mostrarFormulario })
  const categoriasQueryResult = useQuery({ ...categoriasPanaderiaQuery, enabled: mostrarFormulario })
  const puedeAdministrar = esAdmin
  const puedeResolver = rol === 'PANADERO' && !esGlobal
  const puedeReabrir = esAdmin
  const metas = metasQuery.data ?? []
  const programados = new Set(metas.map((meta) => meta.articuloId))
  const categoriasAptas = new Set((categoriasQueryResult.data ?? []).filter((categoria) => categoria.activa).map((categoria) => `${categoria.id}:${categoria.tipo}`))
  const elegibles = (articulosQueryResult.data ?? [])
    .filter((articulo) => articulo.activo && articulo.categoriaId != null && categoriasAptas.has(`${articulo.categoriaId}:${articulo.tipo}`) && (articulo.tipo === 'PANADERIA' || articulo.tipo === 'PASTELERIA') && !programados.has(articulo.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const articuloSeleccionado = elegibles.find((articulo) => String(articulo.id) === articuloId)
  const cantidadNumero = Number(cantidad)
  const cantidadValida = cantidad.trim() !== '' && Number.isSafeInteger(cantidadNumero) && cantidadNumero > 0
  const conteos = {
    pendientes: metas.filter((meta) => meta.estado === 'PENDIENTE').length,
    producidas: metas.filter((meta) => meta.estado === 'PRODUCIDO').length,
    noProducidas: metas.filter((meta) => meta.estado === 'NO_PRODUCIDO').length,
  }
  const resueltas = conteos.producidas + conteos.noProducidas
  const porcentaje = metas.length ? Math.round((resueltas / metas.length) * 100) : 0
  const resumenDisponible = metasQuery.isSuccess

  const crear = useMutation({
    mutationFn: metasProduccionPanaderiaApi.crear,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metasProduccionPanaderiaKeys.all })
      setArticuloId('')
      setCantidad('')
      setMostrarFormulario(false)
      toast.success('Meta agregada al plan diario')
    },
    onError: (error) => toast.error(mensajeError(error)),
  })
  const actualizar = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: EstadoMetaPanaderia }) => metasProduccionPanaderiaApi.cambiarEstado(id, estado),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metasProduccionPanaderiaKeys.all })
      toast.success('Estado de la meta actualizado')
    },
    onError: (error) => toast.error(mensajeError(error)),
  })
  const eliminar = useMutation({
    mutationFn: metasProduccionPanaderiaApi.eliminar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metasProduccionPanaderiaKeys.all })
      toast.success('Meta eliminada')
    },
    onError: (error) => toast.error(mensajeError(error)),
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!puedeAdministrar || !articuloSeleccionado || !cantidadValida) return
    crear.mutate({ fecha, articuloId: articuloSeleccionado.id, cantidadObjetivo: cantidadNumero })
  }

  function cambiarFecha(nuevaFecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return
    setFecha(nuevaFecha)
    setArticuloId('')
    setCantidad('')
    setMostrarFormulario(false)
  }

  function formulario() {
    setArticuloId('')
    setCantidad('')
    setMostrarFormulario((actual) => !actual)
  }

  return <div className="space-y-6">
    <section className="rounded-xl bg-surface-low p-5 sm:p-6" aria-labelledby="metas-panaderia-titulo">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 id="metas-panaderia-titulo" className="font-heading text-2xl font-semibold tracking-tight">Plan diario de producción</h2>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{fechaLarga(fecha)}</p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Las metas se cumplen completas o se marcan como no producidas. Registrar una meta no ingresa existencias; cada hornada se registra en la hoja de producción.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="size-9 px-0" onClick={() => cambiarFecha(desplazarFecha(fecha, -1))} aria-label="Día anterior"><ChevronLeft className="size-4" /></Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" className="h-9 w-44 bg-surface-high pl-9 tabular-nums" aria-label="Fecha del plan de producción" value={fecha} onChange={(evento) => cambiarFecha(evento.target.value)} />
          </div>
          <Button type="button" size="sm" variant="secondary" className="size-9 px-0" onClick={() => cambiarFecha(desplazarFecha(fecha, 1))} aria-label="Día siguiente"><ChevronRight className="size-4" /></Button>
          {fecha !== fechaColombia() && <Button type="button" size="sm" variant="ghost" onClick={() => cambiarFecha(fechaColombia())}>Hoy</Button>}
          {puedeAdministrar && <Button type="button" size="sm" className="btn-heat gap-2" aria-expanded={mostrarFormulario} aria-controls="formulario-meta-panaderia" onClick={formulario}><Plus className="size-4" /> Nueva meta</Button>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm" aria-live="polite">
        <span><strong className="font-heading text-xl tabular-nums text-tertiary">{resumenDisponible ? conteos.pendientes : '—'}</strong> <span className="text-muted-foreground">pendientes</span></span>
        <span><strong className="font-heading text-xl tabular-nums text-emerald-300">{resumenDisponible ? conteos.producidas : '—'}</strong> <span className="text-muted-foreground">producidas</span></span>
        <span><strong className="font-heading text-xl tabular-nums text-red-300">{resumenDisponible ? conteos.noProducidas : '—'}</strong> <span className="text-muted-foreground">no producidas</span></span>
        <span className="ml-auto font-semibold tabular-nums">{resumenDisponible ? `${resueltas} de ${metas.length} resueltas` : 'Sin datos disponibles'}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-high" role={resumenDisponible ? 'progressbar' : undefined} aria-label={resumenDisponible ? 'Avance de metas' : undefined} aria-valuenow={resumenDisponible ? resueltas : undefined} aria-valuemin={resumenDisponible ? 0 : undefined} aria-valuemax={resumenDisponible ? metas.length : undefined}>
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-300" style={{ width: `${porcentaje}%` }} />
      </div>
    </section>

    {puedeAdministrar && mostrarFormulario && <form id="formulario-meta-panaderia" className="grid gap-4 rounded-xl bg-surface-high p-5 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end" onSubmit={enviar}>
      <div className="min-w-0">
        <Label htmlFor="meta-articulo-panaderia">Producto a preparar</Label>
        <Select value={articuloId} onValueChange={setArticuloId} disabled={articulosQueryResult.isPending || categoriasQueryResult.isPending || elegibles.length === 0}>
          <SelectTrigger id="meta-articulo-panaderia" className="mt-2 h-10 w-full"><SelectValue placeholder={articulosQueryResult.isPending || categoriasQueryResult.isPending ? 'Cargando productos…' : 'Selecciona un pan o postre'} /></SelectTrigger>
          <SelectContent>
            {(['PANADERIA', 'PASTELERIA'] as const).map((tipo) => {
              const opciones = elegibles.filter((articulo) => articulo.tipo === tipo)
              return opciones.length ? <SelectGroup key={tipo}><SelectLabel>{tipo === 'PANADERIA' ? 'Panes' : 'Postres'}</SelectLabel>{opciones.map((articulo) => <SelectItem key={articulo.id} value={String(articulo.id)}>{articulo.nombre}</SelectItem>)}</SelectGroup> : null
            })}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="meta-cantidad-panaderia">Cantidad</Label>
        <Input id="meta-cantidad-panaderia" className="mt-2 h-10 tabular-nums" type="number" min="1" step="1" inputMode="numeric" value={cantidad} onChange={(evento) => setCantidad(evento.target.value)} placeholder="Ej. 30" aria-invalid={cantidad !== '' && !cantidadValida} />
      </div>
      <Button type="submit" className="btn-heat h-10" disabled={crear.isPending || !articuloSeleccionado || !cantidadValida}>{crear.isPending ? 'Agregando…' : 'Agregar meta'}</Button>
      {(articulosQueryResult.isError || categoriasQueryResult.isError) && <p role="alert" className="text-sm text-destructive sm:col-span-3">No se pudieron cargar los productos. <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { void articulosQueryResult.refetch(); void categoriasQueryResult.refetch() }}>Reintentar</button></p>}
      {!articulosQueryResult.isPending && !categoriasQueryResult.isPending && !articulosQueryResult.isError && !categoriasQueryResult.isError && elegibles.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-3">No hay panes ni postres activos con categoría vigente pendientes de programar. {esGlobal ? 'El administrador local puede asignar categorías en Catálogo.' : 'Puedes asignar categorías en Catálogo.'}</p>}
      {cantidad !== '' && !cantidadValida && <p role="alert" className="text-sm text-destructive sm:col-span-3">Ingresa una cantidad entera mayor que cero.</p>}
    </form>}

    {metasQuery.isPending ? <div className="space-y-3" role="status" aria-label="Cargando metas de producción"><div className="h-20 animate-pulse rounded-lg bg-surface-low" /><div className="h-20 animate-pulse rounded-lg bg-surface-low" /></div>
      : metasQuery.isError ? <div className="rounded-xl bg-surface-low p-6" role="alert"><p className="text-sm text-destructive">No se pudo cargar el plan de esta fecha.</p><Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void metasQuery.refetch()}>Reintentar</Button></div>
        : metas.length === 0 ? <div className="rounded-xl bg-surface-low px-6 py-12 text-center"><ClipboardList className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-heading text-lg font-semibold">No hay metas para este día</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{puedeAdministrar ? 'Selecciona un pan o postre existente y define cuánto debe prepararse.' : 'Todavía no se han programado productos para esta fecha.'}</p></div>
          : <div className="space-y-7">{(['PANADERIA', 'PASTELERIA'] as const).map((tipo) => {
            const grupo = metas.filter((meta) => meta.tipoSnapshot === tipo)
            if (!grupo.length) return null
            return <section key={tipo} aria-label={tipo === 'PANADERIA' ? 'Metas de panes' : 'Metas de postres'}>
              <div className="mb-3 flex items-baseline justify-between gap-4"><h3 className="font-heading text-lg font-semibold">{tipo === 'PANADERIA' ? 'Panes' : 'Postres'}</h3><span className="text-xs text-muted-foreground tabular-nums">{grupo.length} {grupo.length === 1 ? 'meta' : 'metas'}</span></div>
              <ul className="grid gap-3 xl:grid-cols-2">{grupo.map((meta) => <li key={meta.id} className="rounded-lg bg-surface-low p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-heading text-base font-semibold">{meta.nombreSnapshot}</h4><p className="mt-1 text-xs text-muted-foreground">Indicada por {nombreUsuario(meta.usuarioCrea) ?? 'administración'}</p></div><span className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', ESTADOS[meta.estado].clase)}>{ESTADOS[meta.estado].texto}</span></div>
                <div className="mt-4 flex items-baseline gap-2"><strong className="font-heading text-3xl font-semibold tabular-nums">{formatearCantidad(meta.cantidadObjetivo)}</strong><span className="text-xs uppercase text-muted-foreground">unidades programadas</span></div>
                {meta.fechaResolucion && <p className="mt-2 text-xs text-muted-foreground">Resuelta por {nombreUsuario(meta.usuarioResuelve) ?? 'usuario'} · {new Date(meta.fechaResolucion).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}</p>}
                {(puedeResolver || puedeAdministrar) && <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  {meta.estado === 'PENDIENTE' && puedeResolver && <><Button type="button" size="sm" className="gap-1.5 bg-emerald-400 text-emerald-950 hover:bg-emerald-300" disabled={actualizar.isPending || eliminar.isPending} onClick={() => actualizar.mutate({ id: meta.id, estado: 'PRODUCIDO' })}><Check className="size-4" /> Producido completo</Button><Button type="button" size="sm" variant="secondary" className="gap-1.5 text-red-300 hover:bg-red-400/10" disabled={actualizar.isPending || eliminar.isPending} onClick={() => actualizar.mutate({ id: meta.id, estado: 'NO_PRODUCIDO' })}><X className="size-4" /> No producido</Button></>}
                  {meta.estado !== 'PENDIENTE' && puedeReabrir && <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={actualizar.isPending || eliminar.isPending} onClick={() => actualizar.mutate({ id: meta.id, estado: 'PENDIENTE' })}><RotateCcw className="size-4" /> Reabrir</Button>}
                  {meta.estado === 'PENDIENTE' && puedeAdministrar && <Button type="button" size="sm" variant="ghost" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive" disabled={actualizar.isPending || eliminar.isPending} onClick={() => eliminar.mutate(meta.id)}><Trash2 className="size-4" /> Eliminar</Button>}
                </div>}
              </li>)}</ul>
            </section>
          })}</div>}
  </div>
}
