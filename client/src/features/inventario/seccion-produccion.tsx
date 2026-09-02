import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Beaker,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  PackageOpen,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { productosQuery } from '@/features/catalogo/api'
import {
  ingredientesQuery,
  planProduccionQuery,
  useCambiarEstadoMetaProduccion,
  useCrearMetaProduccion,
  useEliminarMetaProduccion,
} from '@/features/inventario/api'
import { ApiError } from '@/lib/api'
import { formatearCantidad } from '@/lib/formato'
import type {
  EstadoMetaProduccion,
  PlanProduccionDiaria,
  TipoObjetivoProduccion,
  UnidadIngrediente,
} from '@/types/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const COLORES_ESTADO: Record<EstadoMetaProduccion, string> = {
  PENDIENTE: 'border-tertiary/55 bg-tertiary/10 text-tertiary',
  PRODUCIDO: 'border-emerald-400/55 bg-emerald-400/10 text-emerald-300',
  NO_PRODUCIDO: 'border-red-400/55 bg-red-400/10 text-red-300',
}

function fechaLocalIso(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function desplazarFecha(fecha: string, dias: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return fechaLocalIso(new Date(anio, mes - 1, dia + dias, 12))
}

function fechaLarga(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(anio, mes - 1, dia, 12))
}

function nombreUsuario(meta: PlanProduccionDiaria, resolucion = false) {
  const usuario = resolucion ? meta.usuarioResuelve : meta.usuarioCrea
  if (!usuario) return null
  return usuario.empleado
    ? `${usuario.empleado.nombre_empleado} ${usuario.empleado.apellido_empleado}`.trim()
    : usuario.email_usuario
}

function textoError(error: unknown) {
  return error instanceof ApiError ? error.message : 'No se pudo completar la accion'
}

export function SeccionProduccion({ esAdmin }: { esAdmin: boolean }) {
  const [fecha, setFecha] = useState(() => fechaLocalIso())
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const { data: metas, isPending } = useQuery(planProduccionQuery(fecha))

  const resumen = useMemo(() => {
    const conteos = { pendientes: 0, producidas: 0, noProducidas: 0 }
    for (const meta of metas ?? []) {
      if (meta.estado_planProduccion === 'PENDIENTE') conteos.pendientes += 1
      else if (meta.estado_planProduccion === 'PRODUCIDO') conteos.producidas += 1
      else conteos.noProducidas += 1
    }
    return conteos
  }, [metas])

  const total = metas?.length ?? 0
  const resueltas = resumen.producidas + resumen.noProducidas
  const progreso = total === 0 ? 0 : Math.round((resueltas / total) * 100)
  const esHoy = fecha === fechaLocalIso()

  return (
    <div>
      <section className="relative overflow-hidden rounded-xl bg-surface-low p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="micro-label flex items-center gap-2 text-primary">
              <ClipboardCheck className="size-3.5" /> Hoja de preparacion
            </p>
            <h2 className="mt-2 font-heading text-3xl font-semibold capitalize tracking-tighter">
              {fechaLarga(fecha)}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Cada meta se confirma completa. Este tablero no altera las existencias automaticamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="size-10 px-0"
              onClick={() => setFecha((actual) => desplazarFecha(actual, -1))}
              aria-label="Dia anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value || fechaLocalIso())}
                className="h-10 w-44 bg-surface-high pl-9 tabular-nums"
                aria-label="Fecha del plan de produccion"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="size-10 px-0"
              onClick={() => setFecha((actual) => desplazarFecha(actual, 1))}
              aria-label="Dia siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
            {!esHoy ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFecha(fechaLocalIso())}>
                Hoy
              </Button>
            ) : null}
            {esAdmin ? (
              <Button type="button" className="btn-heat gap-2" onClick={() => setFormularioAbierto(true)}>
                <Plus className="size-4" /> Nueva meta
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador etiqueta="Pendientes" valor={resumen.pendientes} clase="text-tertiary" />
          <Indicador etiqueta="Producidas" valor={resumen.producidas} clase="text-emerald-300" />
          <Indicador etiqueta="No producidas" valor={resumen.noProducidas} clase="text-red-300" />
          <div className="rounded-lg bg-surface-high p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="micro-label">Avance</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">{progreso}%</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-lowest">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Cargando plan de produccion…</p>
      ) : total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
          <PackageOpen className="mx-auto size-9 text-muted-foreground" />
          <p className="mt-3 font-heading text-lg font-semibold">No hay metas para este dia</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {esAdmin
              ? 'Agrega el primer producto o ingrediente que el equipo debe dejar listo.'
              : 'El administrador aun no ha publicado indicaciones de produccion.'}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 xl:grid-cols-2">
          {metas?.map((meta) => (
            <TarjetaMeta key={meta.id_planProduccion} meta={meta} esAdmin={esAdmin} />
          ))}
        </ul>
      )}

      <DialogNuevaMeta
        abierto={formularioAbierto}
        fecha={fecha}
        onCerrar={() => setFormularioAbierto(false)}
      />
    </div>
  )
}

function Indicador({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
  return (
    <div className="rounded-lg bg-surface-high p-4">
      <p className="micro-label">{etiqueta}</p>
      <p className={cn('mt-2 font-heading text-3xl font-semibold tabular-nums', clase)}>{valor}</p>
    </div>
  )
}

function TarjetaMeta({ meta, esAdmin }: { meta: PlanProduccionDiaria; esAdmin: boolean }) {
  const cambiarEstado = useCambiarEstadoMetaProduccion()
  const eliminar = useEliminarMetaProduccion()
  const pendiente = meta.estado_planProduccion === 'PENDIENTE'
  const esProducto = meta.tipo_objetivo_planProduccion === 'PRODUCTO'
  const resolvio = nombreUsuario(meta, true)

  function resolver(estado: EstadoMetaProduccion, mensaje: string) {
    cambiarEstado
      .mutateAsync({ id: meta.id_planProduccion, estado })
      .then(() => toast.success(mensaje))
      .catch((error: unknown) => toast.error(textoError(error)))
  }

  return (
    <li className="group overflow-hidden rounded-xl bg-surface-low transition-colors hover:bg-surface">
      <div className={cn('h-1 w-full', pendiente ? 'bg-tertiary' : meta.estado_planProduccion === 'PRODUCIDO' ? 'bg-emerald-400' : 'bg-red-400')} />
      <div className="p-5">
        <div className="flex items-start gap-4">
          <span className={cn(
            'grid size-11 shrink-0 place-items-center rounded-lg border',
            esProducto ? 'border-primary/30 bg-primary/10 text-primary' : 'border-sky-400/30 bg-sky-400/10 text-sky-300',
          )}>
            {esProducto ? <PackageOpen className="size-5" /> : <Beaker className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="micro-label">{esProducto ? 'Producto' : 'Ingrediente'}</p>
                <h3 className="mt-1 truncate font-heading text-lg font-semibold">
                  {meta.nombre_objetivo_planProduccion}
                </h3>
              </div>
              <span className={cn(
                'rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                COLORES_ESTADO[meta.estado_planProduccion],
              )}>
                {meta.estado_planProduccion === 'PENDIENTE'
                  ? 'Pendiente'
                  : meta.estado_planProduccion === 'PRODUCIDO'
                    ? 'Producido'
                    : 'No producido'}
              </span>
            </div>

            <div className="mt-4 flex items-end gap-2">
              <span className="font-heading text-4xl font-semibold leading-none tabular-nums">
                {formatearCantidad(meta.cantidad_objetivo_planProduccion)}
              </span>
              <span className="pb-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {meta.unidad_objetivo_planProduccion}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Indicada por {nombreUsuario(meta) ?? 'usuario no disponible'}
              {resolvio && meta.fecha_resolucion_planProduccion
                ? ` · Resuelta por ${resolvio} a las ${new Date(meta.fecha_resolucion_planProduccion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {pendiente ? (
            <>
              <Button
                type="button"
                size="sm"
                className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                disabled={cambiarEstado.isPending}
                onClick={() => resolver('PRODUCIDO', 'Meta marcada como producida')}
              >
                <Check className="size-4" /> Producido completo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="text-red-300 hover:bg-red-400/10 hover:text-red-200"
                disabled={cambiarEstado.isPending}
                onClick={() => resolver('NO_PRODUCIDO', 'Meta marcada como no producida')}
              >
                <X className="size-4" /> No producido
              </Button>
              {esAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  disabled={eliminar.isPending}
                  onClick={() =>
                    eliminar
                      .mutateAsync(meta.id_planProduccion)
                      .then(() => toast.success('Meta eliminada'))
                      .catch((error: unknown) => toast.error(textoError(error)))
                  }
                >
                  <Trash2 className="size-4" /> Eliminar
                </Button>
              ) : null}
            </>
          ) : esAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={cambiarEstado.isPending}
              onClick={() => resolver('PENDIENTE', 'Meta reabierta')}
            >
              <RotateCcw className="size-4" /> Reabrir para corregir
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">La decision ya fue registrada.</p>
          )}
        </div>
      </div>
    </li>
  )
}

function DialogNuevaMeta({ abierto, fecha, onCerrar }: { abierto: boolean; fecha: string; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoObjetivoProduccion>('PRODUCTO')
  const [idObjetivo, setIdObjetivo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const { data: productos } = useQuery(productosQuery)
  const { data: ingredientes } = useQuery(ingredientesQuery)
  const crear = useCrearMetaProduccion()

  useEffect(() => {
    if (abierto) {
      setTipo('PRODUCTO')
      setIdObjetivo('')
      setCantidad('')
    }
  }, [abierto])

  const opcionesProducto = useMemo(
    () => (productos ?? []).filter((producto) => producto.habilitado_producto),
    [productos],
  )
  const ingredienteSeleccionado = ingredientes?.find((item) => item.id_ingrediente === Number(idObjetivo))
  const unidad: UnidadIngrediente = tipo === 'PRODUCTO' ? 'UNIDADES' : ingredienteSeleccionado?.unidades_ingrediente ?? 'UNIDADES'
  const cantidadNumero = Number(cantidad)
  const cantidadValida = cantidadNumero > 0 && (tipo === 'INGREDIENTE' || Number.isInteger(cantidadNumero))

  function cambiarTipo(nuevoTipo: TipoObjetivoProduccion) {
    setTipo(nuevoTipo)
    setIdObjetivo('')
    setCantidad('')
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!idObjetivo || !cantidadValida) return
    crear
      .mutateAsync({ fecha, tipo, idObjetivo: Number(idObjetivo), cantidad: cantidadNumero })
      .then(() => {
        toast.success('Meta agregada al plan diario')
        onCerrar()
      })
      .catch((error: unknown) => toast.error(textoError(error)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Nueva meta de produccion</DialogTitle>
          <DialogDescription>
            Se agregara a {fechaLarga(fecha)}. La cantidad se confirma completa o como no producida.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={enviar}>
          <div>
            <Label>Tipo de preparacion</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cambiarTipo('PRODUCTO')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors',
                  tipo === 'PRODUCTO' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                )}
              >
                <PackageOpen className="size-4" /> Producto
              </button>
              <button
                type="button"
                onClick={() => cambiarTipo('INGREDIENTE')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors',
                  tipo === 'INGREDIENTE' ? 'border-sky-400 bg-sky-400/10 text-sky-300' : 'border-border text-muted-foreground',
                )}
              >
                <Beaker className="size-4" /> Ingrediente
              </button>
            </div>
          </div>

          <div>
            <Label>{tipo === 'PRODUCTO' ? 'Producto' : 'Ingrediente'}</Label>
            <Select value={idObjetivo} onValueChange={setIdObjetivo}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder={`Selecciona un ${tipo === 'PRODUCTO' ? 'producto' : 'ingrediente'}`} />
              </SelectTrigger>
              <SelectContent>
                {tipo === 'PRODUCTO'
                  ? opcionesProducto.map((producto) => (
                      <SelectItem key={producto.id_producto} value={String(producto.id_producto)}>
                        {producto.nombre_producto}
                      </SelectItem>
                    ))
                  : ingredientes?.map((ingrediente) => (
                      <SelectItem key={ingrediente.id_ingrediente} value={String(ingrediente.id_ingrediente)}>
                        {ingrediente.nombre_ingrediente} · {ingrediente.unidades_ingrediente}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cantidad-produccion">Cantidad objetivo</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="cantidad-produccion"
                type="number"
                min={tipo === 'PRODUCTO' ? 1 : 0.0001}
                step={tipo === 'PRODUCTO' ? 1 : 'any'}
                inputMode="decimal"
                value={cantidad}
                onChange={(evento) => setCantidad(evento.target.value)}
                placeholder={tipo === 'PRODUCTO' ? 'Ej. 30' : 'Ej. 2.5'}
                className="text-lg tabular-nums"
              />
              <span className="min-w-24 rounded-md bg-surface-high px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {unidad}
              </span>
            </div>
            {cantidad && !cantidadValida ? (
              <p className="mt-2 text-xs text-destructive">
                {tipo === 'PRODUCTO' ? 'Los productos requieren una cantidad entera mayor que cero.' : 'Ingresa una cantidad mayor que cero.'}
              </p>
            ) : null}
          </div>

          <Button className="btn-heat w-full" disabled={crear.isPending || !idObjetivo || !cantidadValida}>
            {crear.isPending ? 'Agregando…' : 'Agregar al plan del dia'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
