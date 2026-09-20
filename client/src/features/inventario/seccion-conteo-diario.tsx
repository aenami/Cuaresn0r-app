import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { productosQuery } from '@/features/catalogo/api'
import {
  conteoInventarioQuery,
  ingredientesQuery,
  elementosConteoQuery,
  useAgregarElementoConteo,
  useRetirarElementoConteo,
  useFinalizarConteoInventario,
  useReabrirConteoInventario,
} from '@/features/inventario/api'
import { ApiError } from '@/lib/api'
import { formatearCantidad } from '@/lib/formato'
import type { ConteoInventarioDiario, TipoObjetivoProduccion, UnidadIngrediente } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

function fechaLocalIso(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha)
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function desplazarFecha(fecha: string, dias: number) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return fechaLocalIso(new Date(Date.UTC(anio, mes - 1, dia + dias, 12)))
}

function fechaLarga(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(anio, mes - 1, dia, 12))
}

function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
  })
}

function textoError(error: unknown) {
  return error instanceof ApiError ? error.message : 'No se pudo completar la accion'
}

function nombreUsuario(conteo: ConteoInventarioDiario) {
  const usuario = conteo.usuarioCierra
  if (!usuario) return null
  return usuario.empleado
    ? `${usuario.empleado.nombre_empleado} ${usuario.empleado.apellido_empleado}`.trim()
    : usuario.email_usuario
}

export function SeccionConteoDiario({ esAdmin }: { esAdmin: boolean }) {
  const [fecha, setFecha] = useState(() => fechaLocalIso())
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const { data: conteos, isPending, error } = useQuery(conteoInventarioQuery(fecha))
  const resumen = useMemo(() => {
    const lista = conteos ?? []
    return {
      total: lista.length,
      pendientes: lista.filter((item) => item.estado_conteoInventario === 'PENDIENTE').length,
      finalizados: lista.filter((item) => item.estado_conteoInventario === 'FINALIZADO').length,
      conEntradas: lista.filter((item) => Number(item.cantidad_entradas_conteoInventario) > 0).length,
    }
  }, [conteos])
  const esHoy = fecha === fechaLocalIso()

  return (
    <div>
      <section className="relative overflow-hidden rounded-xl bg-surface-low p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-14 size-52 rounded-full bg-secondary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="micro-label flex items-center gap-2 text-secondary">
              <ClipboardList className="size-3.5" /> Verificacion de cierre
            </p>
            <h2 className="mt-2 font-heading text-3xl font-semibold capitalize tracking-tighter">
              {fechaLarga(fecha)}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Compara el saldo anterior y las entradas recibidas o producidas con el conteo fisico. La diferencia
              muestra la salida aparente del dia sin modificar el inventario automatico.
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
                aria-label="Fecha del conteo de inventario"
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
              <Button type="button" className="btn-heat gap-2" onClick={() => setDialogoAbierto(true)}>
                <ClipboardList className="size-4" /> Configurar lista diaria
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador etiqueta="Por contar" valor={resumen.pendientes} clase="text-tertiary" />
          <Indicador etiqueta="Finalizados" valor={resumen.finalizados} clase="text-emerald-300" />
          <Indicador etiqueta="Con entradas" valor={resumen.conEntradas} clase="text-sky-300" />
          <Indicador etiqueta="Elementos" valor={resumen.total} clase="text-foreground" />
        </div>
      </section>

      {isPending ? (
        <p className="mt-6 text-sm text-muted-foreground">Cargando hoja de conteo…</p>
      ) : error ? (
        <p role="alert" className="mt-6 text-sm text-destructive">{textoError(error)}</p>
      ) : resumen.total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
          <Scale className="mx-auto size-9 text-muted-foreground" />
          <p className="mt-3 font-heading text-lg font-semibold">No hay elementos para verificar</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {esHoy
              ? 'El administrador define la lista diaria. Sus elementos aparecerán automáticamente cada día para ingresar el conteo físico.'
              : 'No hay conteos registrados para esta fecha. La lista automática se prepara en la jornada actual.'}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 xl:grid-cols-2">
          {conteos?.map((conteo) => (
            <TarjetaConteo key={conteo.id_conteoInventario} conteo={conteo} esAdmin={esAdmin} />
          ))}
        </ul>
      )}

      {esAdmin && dialogoAbierto ? (
        <DialogNuevoConteo abierto={dialogoAbierto} onCerrar={() => setDialogoAbierto(false)} />
      ) : null}
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

function TarjetaConteo({ conteo, esAdmin }: { conteo: ConteoInventarioDiario; esAdmin: boolean }) {
  const [cantidadFisica, setCantidadFisica] = useState('')
  const finalizar = useFinalizarConteoInventario()
  const reabrir = useReabrirConteoInventario()
  const anterior = Number(conteo.cantidad_anterior_conteoInventario)
  const entradas = Number(conteo.cantidad_entradas_conteoInventario)
  const disponible = anterior + entradas
  const fisico = cantidadFisica === '' ? null : Number(cantidadFisica)
  const salidaVista = fisico === null || Number.isNaN(fisico) ? null : disponible - fisico
  const salidaFinal =
    conteo.cantidad_salida_conteoInventario === null ? null : Number(conteo.cantidad_salida_conteoInventario)
  const salida = salidaFinal ?? salidaVista
  const finalizado = conteo.estado_conteoInventario === 'FINALIZADO'
  const unidad = conteo.unidad_objetivo_conteoInventario
  const diferenciaSistema =
    finalizado && conteo.stock_sistema_conteoInventario !== null && conteo.cantidad_fisica_conteoInventario !== null
      ? Number(conteo.cantidad_fisica_conteoInventario) - Number(conteo.stock_sistema_conteoInventario)
      : null

  return (
    <li
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-low transition-colors',
        finalizado ? 'border-emerald-400/25' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-heading text-lg font-semibold">{conteo.nombre_objetivo_conteoInventario}</h3>
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {conteo.tipo_objetivo_conteoInventario === 'PRODUCTO' ? 'Producto' : 'Ingrediente'}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-3" />
            {conteo.fecha_anterior_conteoInventario
              ? `Ultimo cierre: ${fechaCorta(conteo.fecha_anterior_conteoInventario)}`
              : 'Primer registro: saldo inicial manual'}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
            finalizado
              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
              : 'border-tertiary/45 bg-tertiary/10 text-tertiary',
          )}
        >
          {finalizado ? 'Contado' : 'Pendiente'}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/70 bg-surface-high/45">
        <Dato etiqueta="Saldo anterior" valor={anterior} unidad={unidad} />
        <Dato
          etiqueta="Entradas hoy"
          valor={entradas}
          unidad={unidad}
          clase={entradas > 0 ? 'text-sky-300' : 'text-muted-foreground'}
          icono={entradas > 0 ? <ArrowDownToLine className="size-3" /> : undefined}
        />
        <Dato etiqueta="Disponible" valor={disponible} unidad={unidad} clase="text-foreground" />
      </div>

      <div className="p-4">
        {finalizado ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Resultado
              etiqueta="Conteo fisico"
              valor={Number(conteo.cantidad_fisica_conteoInventario)}
              unidad={unidad}
              clase="text-emerald-300"
            />
            <Resultado
              etiqueta={
                conteo.tipo_objetivo_conteoInventario === 'PRODUCTO' ? 'Vendido calculado' : 'Consumo calculado'
              }
              valor={salida ?? 0}
              unidad={unidad}
              clase={(salida ?? 0) < 0 ? 'text-rose-300' : 'text-tertiary'}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor={`fisico-${conteo.id_conteoInventario}`}>Conteo fisico al cierre</Label>
              <div className="relative mt-1.5">
                <Input
                  id={`fisico-${conteo.id_conteoInventario}`}
                  type="number"
                  min={0}
                  step={conteo.tipo_objetivo_conteoInventario === 'PRODUCTO' ? 1 : 'any'}
                  value={cantidadFisica}
                  onChange={(evento) => setCantidadFisica(evento.target.value)}
                  className="pr-20 tabular-nums"
                  placeholder="0"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {unidad}
                </span>
              </div>
            </div>
            <Resultado
              etiqueta={conteo.tipo_objetivo_conteoInventario === 'PRODUCTO' ? 'Venta estimada' : 'Consumo estimado'}
              valor={salida ?? 0}
              unidad={unidad}
              clase={salida !== null && salida < 0 ? 'text-rose-300' : 'text-tertiary'}
            />
            <Button
              type="button"
              className="btn-heat"
              disabled={fisico === null || Number.isNaN(fisico) || fisico < 0 || finalizar.isPending}
              onClick={() => {
                if (fisico === null) return
                finalizar
                  .mutateAsync({
                    id: conteo.id_conteoInventario,
                    cantidadFisica: fisico,
                  })
                  .then(() => toast.success('Conteo fisico finalizado'))
                  .catch((error: unknown) => toast.error(textoError(error)))
              }}
            >
              <Check className="size-4" /> Confirmar
            </Button>
          </div>
        )}

        {salida !== null && salida < 0 ? (
          <div className="mt-3 flex gap-2 rounded-lg border border-rose-400/25 bg-rose-400/8 p-3 text-xs text-rose-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            El conteo supera el saldo disponible. Revisa si hubo produccion o una entrada sin registrar.
          </div>
        ) : null}

        {diferenciaSistema !== null ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Stock automatico al confirmar: {formatearCantidad(conteo.stock_sistema_conteoInventario!)} {unidad}
            {' · '}Diferencia fisica: {diferenciaSistema > 0 ? '+' : ''}
            {formatearCantidad(diferenciaSistema)} {unidad}
          </p>
        ) : null}

        <div className="mt-4 flex min-h-7 items-center justify-between gap-3 border-t border-border/70 pt-3">
          <p className="text-[11px] text-muted-foreground">
            {finalizado
              ? `Confirmado por ${nombreUsuario(conteo) ?? 'un trabajador'}`
              : 'Salida = saldo anterior + entradas - conteo fisico'}
          </p>
          {esAdmin ? (
            <div className="flex gap-1">
              {finalizado ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={reabrir.isPending}
                  onClick={() =>
                    reabrir
                      .mutateAsync(conteo.id_conteoInventario)
                      .then(() => toast.success('Conteo reabierto'))
                      .catch((error: unknown) => toast.error(textoError(error)))
                  }
                >
                  <RotateCcw className="size-3" /> Reabrir
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function Dato({
  etiqueta,
  valor,
  unidad,
  clase,
  icono,
}: {
  etiqueta: string
  valor: number
  unidad: UnidadIngrediente
  clase?: string
  icono?: ReactNode
}) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={cn('mt-1 flex items-center gap-1 font-heading text-lg font-semibold tabular-nums', clase)}>
        {icono}
        {formatearCantidad(valor)}
        <span className="text-[10px] font-normal text-muted-foreground">{unidad}</span>
      </p>
    </div>
  )
}

function Resultado({
  etiqueta,
  valor,
  unidad,
  clase,
}: {
  etiqueta: string
  valor: number
  unidad: UnidadIngrediente
  clase: string
}) {
  return (
    <div className="rounded-lg bg-surface-high px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={cn('mt-1 font-heading text-lg font-semibold tabular-nums', clase)}>
        {formatearCantidad(valor)} <span className="text-xs font-normal text-muted-foreground">{unidad}</span>
      </p>
    </div>
  )
}

function DialogNuevoConteo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { data: productos } = useQuery(productosQuery)
  const { data: ingredientes } = useQuery(ingredientesQuery)
  const { data: elementos, isPending, error } = useQuery(elementosConteoQuery)
  const crear = useAgregarElementoConteo()
  const retirar = useRetirarElementoConteo()
  const [tipo, setTipo] = useState<TipoObjetivoProduccion>('INGREDIENTE')
  const [idObjetivo, setIdObjetivo] = useState('')
  const [cantidadInicial, setCantidadInicial] = useState('')
  const opcionesDisponibles =
    tipo === 'PRODUCTO'
      ? (productos ?? [])
          .filter((producto) => producto.habilitado_producto)
          .map((producto) => ({
            id: producto.id_producto,
            nombre: producto.nombre_producto,
            detalle: 'UNIDADES',
          }))
      : (ingredientes ?? []).map((ingrediente) => ({
          id: ingrediente.id_ingrediente,
          nombre: ingrediente.nombre_ingrediente,
          detalle: ingrediente.unidades_ingrediente,
        }))

  const opciones = opcionesDisponibles.filter((opcion) => !(elementos ?? []).some((elemento) =>
    elemento.tipo === tipo && (elemento.idProducto ?? elemento.idIngrediente) === opcion.id,
  ))

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    crear
      .mutateAsync({
        tipo,
        idObjetivo: Number(idObjetivo),
        ...(cantidadInicial !== '' && {
          cantidadInicial: Number(cantidadInicial),
        }),
      })
      .then(() => {
        toast.success('Elemento agregado a la lista diaria')
        setIdObjetivo('')
        setCantidadInicial('')
      })
      .catch((error: unknown) => toast.error(textoError(error)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lista fija del conteo diario</DialogTitle>
          <DialogDescription>
            Define una sola vez qué debe contar el equipo. Los elementos se incluirán desde hoy y cada día siguiente.
            Retirarlos detiene su inclusión en nuevas jornadas; los conteos ya creados se conservan.
          </DialogDescription>
        </DialogHeader>
        {isPending ? <p className="text-sm text-muted-foreground">Cargando lista…</p> : error ? (
          <p role="alert" className="text-sm text-destructive">{textoError(error)}</p>
        ) : (
          <ul className="max-h-52 space-y-2 overflow-y-auto">
            {elementos?.map((elemento) => (
              <li key={elemento.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-high p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{elemento.producto?.nombre_producto ?? elemento.ingrediente?.nombre_ingrediente}</p>
                  <p className="text-xs text-muted-foreground">{elemento.tipo === 'PRODUCTO' ? 'Producto' : 'Ingrediente'}
                    {elemento.producto?.habilitado_producto === false ? ' · Deshabilitado: no se incluirá' : ''}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={retirar.isPending}
                  onClick={() => retirar.mutateAsync(elemento.id)
                    .then(() => toast.success('Elemento retirado de la lista diaria. Se conserva el historial.'))
                    .catch((error: unknown) => toast.error(textoError(error)))}>
                  <Trash2 className="size-3" /> Retirar
                </Button>
              </li>
            ))}
            {elementos?.length === 0 ? <li className="text-sm text-muted-foreground">Aún no hay elementos en la lista diaria.</li> : null}
          </ul>
        )}
        <form className="space-y-4" onSubmit={enviar}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(valor) => {
                  setTipo(valor as TipoObjetivoProduccion)
                  setIdObjetivo('')
                }}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INGREDIENTE">Ingrediente</SelectItem>
                  <SelectItem value="PRODUCTO">Producto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Elemento</Label>
              <Select value={idObjetivo} onValueChange={setIdObjetivo}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {opciones.map((opcion) => (
                    <SelectItem key={opcion.id} value={String(opcion.id)}>
                      {opcion.nombre} · {opcion.detalle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-high p-3">
            <Label htmlFor="saldo-inicial">Saldo inicial, si es el primer conteo</Label>
            <Input
              id="saldo-inicial"
              type="number"
              min={0}
              step={tipo === 'PRODUCTO' ? 1 : 'any'}
              value={cantidadInicial}
              onChange={(evento) => setCantidadInicial(evento.target.value)}
              className="mt-1.5"
              placeholder="No es necesario si ya existe un cierre anterior"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              El sistema usara automaticamente el ultimo conteo fisico finalizado. Este valor solo inicia un historial
              nuevo.
            </p>
          </div>
          <Button className="btn-heat w-full" disabled={!idObjetivo || crear.isPending || isPending || !!error}>
            <Plus className="size-4" /> Agregar elemento
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
