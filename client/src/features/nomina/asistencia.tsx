import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Clock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Empleado, Jornada } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { empleadosQuery, jornadasQuery, useGuardarHorario } from './api'
import { errorApi, nombreEmpleado } from './comun'
import {
  describirTramos,
  duracionHorario,
  formatearDuracion,
  hoyColombia,
  prepararHorario,
  tramoVacio,
  tramosDeJornada,
} from './horario'
import type { TramoEditable } from './horario'

const fechaVisible = (fecha: string) =>
  new Date(fecha + 'T12:00:00Z').toLocaleDateString('es-CO', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })

export function Asistencia() {
  const empleados = useQuery(empleadosQuery('ACTIVO'))
  const [fecha, setFecha] = useState(hoyColombia)
  const jornadas = useQuery({ ...jornadasQuery({ fecha }), enabled: !!fecha })
  const abiertas = useQuery(jornadasQuery({ estado: 'ABIERTA' }))
  const [edicion, setEdicion] = useState<{
    fecha: string
    jornada?: Jornada
  } | null>(null)
  const lista = jornadas.data ?? []
  const delDia = lista.filter((j) => j.fecha_jornada.slice(0, 10) === fecha)
  const pendientesAnteriores = (abiertas.data ?? []).filter(
    (j) =>
      j.estado_jornada === 'ABIERTA' && j.fecha_jornada.slice(0, 10) !== fecha,
  )
  const puedeRegistrar =
    !empleados.isPending &&
    !empleados.isError &&
    !!empleados.data?.length &&
    !!fecha &&
    fecha <= hoyColombia()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">Asistencia</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra los horarios trabajados y confirma la duración total, sin
            marcar entradas en vivo.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="asistencia-fecha">Fecha de la jornada</Label>
            <Input
              id="asistencia-fecha"
              type="date"
              value={fecha}
              max={hoyColombia()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <Button
            className="btn-heat"
            disabled={!puedeRegistrar}
            onClick={() => setEdicion({ fecha })}
          >
            <Plus className="size-4" /> Registrar horario
          </Button>
        </div>
      </div>
      {empleados.isError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar los empleados.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void empleados.refetch()}
          >
            Reintentar
          </Button>
        </p>
      ) : empleados.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Crea un empleado activo en el Directorio para registrar su horario.
        </p>
      ) : null}
      {fecha && jornadas.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando horarios…</p>
      ) : fecha && jornadas.isError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar los horarios.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void jornadas.refetch()}
          >
            Reintentar
          </Button>
        </p>
      ) : (
        <section aria-label="Horarios de la fecha seleccionada">
          <h3 className="mb-3 font-medium">
            {fecha ? fechaVisible(fecha) : 'Selecciona una fecha'}
          </h3>
          {delDia.length ? (
            <ul className="space-y-2">
              {delDia.map((j) => (
                <HorarioRegistrado
                  key={j.id_jornada}
                  jornada={j}
                  onEditar={() =>
                    setEdicion({
                      fecha: j.fecha_jornada.slice(0, 10),
                      jornada: j,
                    })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">
              No hay horarios registrados para esta fecha.
            </p>
          )}
        </section>
      )}
      {!jornadas.isError && pendientesAnteriores.length > 0 ? (
        <section aria-label="Jornadas anteriores pendientes">
          <h3 className="mb-1 font-heading text-lg font-semibold">
            Horarios por completar
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Completa las jornadas antiguas que quedaron abiertas antes de
            registrar otro día para ese empleado.
          </p>
          <ul className="space-y-2">
            {pendientesAnteriores.map((j) => (
              <HorarioRegistrado
                key={j.id_jornada}
                jornada={j}
                mostrarFecha
                onEditar={() =>
                  setEdicion({
                    fecha: j.fecha_jornada.slice(0, 10),
                    jornada: j,
                  })
                }
              />
            ))}
          </ul>
        </section>
      ) : null}
      {abiertas.isError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron consultar las jornadas por completar.{' '}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void abiertas.refetch()}
          >
            Reintentar
          </Button>
        </p>
      ) : null}
      {edicion ? (
        <HorarioDialog
          fecha={edicion.fecha}
          jornada={edicion.jornada}
          activos={empleados.data ?? []}
          onCerrar={() => setEdicion(null)}
        />
      ) : null}
    </div>
  )
}

function HorarioRegistrado({
  jornada,
  mostrarFecha,
  onEditar,
}: {
  jornada: Jornada
  mostrarFecha?: boolean
  onEditar: () => void
}) {
  const confirmada = jornada.estado_jornada === 'CERRADA'
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-high p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {jornada.empleado
              ? nombreEmpleado(jornada.empleado)
              : 'Empleado #' + jornada.id_empleado_jornada}
          </p>
          <span
            className={
              confirmada ? 'text-xs text-emerald-300' : 'text-xs text-tertiary'
            }
          >
            {confirmada ? 'Confirmado' : 'Por completar'}
          </span>
        </div>
        {mostrarFecha ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {fechaVisible(jornada.fecha_jornada.slice(0, 10))}
          </p>
        ) : null}
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {describirTramos(jornada) || 'Sin horario registrado'}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          <Clock className="size-4 text-muted-foreground" />
          {duracionHorario(jornada)}
        </span>
        <Button variant="outline" size="sm" onClick={onEditar}>
          <Pencil className="size-3.5" />
          {confirmada ? 'Editar horario' : 'Completar horario'}
        </Button>
      </div>
    </li>
  )
}

function HorarioDialog({
  fecha,
  jornada,
  activos,
  onCerrar,
}: {
  fecha: string
  jornada?: Jornada
  activos: Empleado[]
  onCerrar: () => void
}) {
  const guardar = useGuardarHorario()
  const [idEmpleado, setIdEmpleado] = useState(
    jornada ? String(jornada.id_empleado_jornada) : '',
  )
  const [tramos, setTramos] = useState(() => tramosDeJornada(jornada))
  const [errorServidor, setErrorServidor] = useState('')
  const resumen = prepararHorario(fecha, tramos)
  const cerrado = jornada?.estado_jornada === 'CERRADA'
  const nombre = jornada?.empleado
    ? nombreEmpleado(jornada.empleado)
    : 'Empleado #' + jornada?.id_empleado_jornada

  function cambiar(indice: number, cambio: Partial<TramoEditable>) {
    setTramos((anteriores) =>
      anteriores.map((t, i) => (i === indice ? { ...t, ...cambio } : t)),
    )
    setErrorServidor('')
  }

  async function confirmar() {
    if (!idEmpleado || !resumen.valido || guardar.isPending) return
    setErrorServidor('')
    try {
      await guardar.mutateAsync({
        idEmpleado: Number(idEmpleado),
        fecha,
        ...(jornada && { idJornada: jornada.id_jornada }),
        tramos: resumen.tramos,
      })
      toast.success('Horario confirmado y nómina calculada')
      onCerrar()
    } catch (error) {
      setErrorServidor(errorApi(error))
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => !abierto && !guardar.isPending && onCerrar()}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {jornada ? 'Completar o editar horario' : 'Registrar horario'}
          </DialogTitle>
          <DialogDescription>
            {fechaVisible(fecha)} · Colombia. Agrega un tramo por cada período
            trabajado; las pausas no se suman.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void confirmar()
          }}
        >
          <fieldset disabled={guardar.isPending} className="space-y-5">
            <div>
              <Label htmlFor="horario-empleado">Trabajador</Label>
              {jornada ? (
                <Input id="horario-empleado" value={nombre} readOnly />
              ) : (
                <Select
                  value={idEmpleado}
                  onValueChange={(valor) => {
                    setIdEmpleado(valor)
                    setErrorServidor('')
                  }}
                >
                  <SelectTrigger id="horario-empleado" className="w-full">
                    <SelectValue placeholder="Selecciona un trabajador" />
                  </SelectTrigger>
                  <SelectContent>
                    {activos.map((e) => (
                      <SelectItem
                        key={e.id_empleado}
                        value={String(e.id_empleado)}
                      >
                        {nombreEmpleado(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-4">
              {tramos.map((tramo, indice) => (
                <div key={indice} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Tramo {indice + 1}</p>
                    {tramos.length > 1 ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={'Eliminar tramo ' + (indice + 1)}
                        onClick={() => {
                          setTramos((anteriores) =>
                            anteriores.filter((_, i) => i !== indice),
                          )
                          setErrorServidor('')
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={'horario-entrada-' + indice}>
                        Entrada
                      </Label>
                      <Input
                        id={'horario-entrada-' + indice}
                        type="time"
                        required
                        value={tramo.inicio}
                        onChange={(e) =>
                          cambiar(indice, { inicio: e.target.value })
                        }
                      />
                      {indice > 0 ? (
                        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={tramo.entradaDiaSiguiente}
                            onChange={(e) =>
                              cambiar(indice, {
                                entradaDiaSiguiente: e.target.checked,
                              })
                            }
                          />
                          Día siguiente
                        </label>
                      ) : null}
                    </div>
                    <div>
                      <Label htmlFor={'horario-salida-' + indice}>Salida</Label>
                      <Input
                        id={'horario-salida-' + indice}
                        type="time"
                        required
                        value={tramo.fin}
                        onChange={(e) =>
                          cambiar(indice, { fin: e.target.value })
                        }
                      />
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={tramo.salidaDiaSiguiente}
                          onChange={(e) =>
                            cambiar(indice, {
                              salidaDiaSiguiente: e.target.checked,
                            })
                          }
                        />
                        Día siguiente
                      </label>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={tramos.length >= 12}
                onClick={() =>
                  setTramos((anteriores) => [
                    ...anteriores,
                    {
                      ...tramoVacio(),
                      entradaDiaSiguiente:
                        anteriores.at(-1)?.salidaDiaSiguiente ?? false,
                      salidaDiaSiguiente:
                        anteriores.at(-1)?.salidaDiaSiguiente ?? false,
                    },
                  ])
                }
              >
                <Plus className="size-4" /> Agregar tramo (turno partido)
              </Button>
            </div>
            <div
              className="flex items-center justify-between gap-3 bg-surface-high p-4"
              role="status"
              aria-live="polite"
            >
              <span className="text-sm">Tiempo trabajado</span>
              <strong
                data-total-horario
                className="font-heading text-xl tabular-nums text-primary"
              >
                {resumen.valido ? formatearDuracion(resumen.minutos) : '—'}
              </strong>
            </div>
            {!resumen.valido ? (
              <p role="status" className="text-sm text-muted-foreground">
                {resumen.mensaje}
              </p>
            ) : null}
            {cerrado ? (
              <p className="text-sm text-muted-foreground">
                Se recalculará la nómina de esta jornada. Solo se puede corregir
                si aún no tiene pagos aplicados.
              </p>
            ) : null}
            {errorServidor ? (
              <p role="alert" className="text-sm text-destructive">
                {errorServidor}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="btn-heat"
                disabled={!idEmpleado || !resumen.valido || guardar.isPending}
              >
                {guardar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {guardar.isPending ? 'Confirmando…' : 'Confirmar horario'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
