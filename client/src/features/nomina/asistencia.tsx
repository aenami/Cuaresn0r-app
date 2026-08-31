import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarClock,
  ClipboardList,
  Clock,
  Coffee,
  Loader2,
  LogIn,
  Undo2,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  empleadosQuery,
  jornadasQuery,
  useCerrarJornada,
  useDeshacerMarcacion,
  useMarcar,
} from '@/features/nomina/api'
import type { Empleado, Jornada, Marcacion } from '@/types/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { errorApi, idCorto, nombreEmpleado } from './comun'

// Ultima marcacion de una jornada abierta (define si esta trabajando o en pausa).
function ultimaMarcacion(j: Jornada): Marcacion | undefined {
  const m = j.marcaciones ?? []
  return m[m.length - 1]
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function duracionDesde(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function Asistencia() {
  const { data: abiertas } = useQuery(jornadasQuery({ estado: 'ABIERTA' }))
  const { data: activos } = useQuery(empleadosQuery('ACTIVO'))
  const marcar = useMarcar()
  const [idSel, setIdSel] = useState<string>('')
  const [manual, setManual] = useState(false)

  // Refresca duraciones cada minuto.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const jornadas = abiertas ?? []
  const trabajando = jornadas.filter((j) => ultimaMarcacion(j)?.tipo_marcacion === 'ENTRADA')
  const enPausa = jornadas.filter((j) => ultimaMarcacion(j)?.tipo_marcacion === 'SALIDA')

  // Estado de marcacion del empleado seleccionado, para etiquetar el boton.
  const jornadaSel = jornadas.find((j) => j.id_empleado_jornada === Number(idSel))
  const proximaEsSalida = ultimaMarcacion(jornadaSel ?? ({} as Jornada))?.tipo_marcacion === 'ENTRADA'

  function marcarSel() {
    if (idSel === '') return
    marcar
      .mutateAsync({ idEmpleado: Number(idSel) })
      .then((r) => toast.success(r.marcacion.tipo_marcacion === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada'))
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      {/* Reloj + marcacion */}
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface-high p-6 text-center">
          <p className="micro-label">Hora del sistema</p>
          <Reloj />
          <div className="mt-6 space-y-3 text-left">
            <Select value={idSel} onValueChange={setIdSel}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Elige un empleado" />
              </SelectTrigger>
              <SelectContent>
                {(activos ?? []).map((e) => (
                  <SelectItem key={e.id_empleado} value={String(e.id_empleado)}>
                    {nombreEmpleado(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="btn-heat h-14 w-full gap-2 font-heading text-base font-semibold uppercase tracking-wide"
              disabled={idSel === '' || marcar.isPending}
              onClick={marcarSel}
            >
              {marcar.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <LogIn className={cn('size-5', proximaEsSalida && 'rotate-180')} />
              )}
              {proximaEsSalida ? 'Marcar salida' : 'Marcar entrada'}
            </Button>
            <p className="text-xs text-muted-foreground">
              El sistema alterna entrada/salida segun la ultima marca del empleado.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={(activos ?? []).length === 0}
              onClick={() => setManual(true)}
            >
              <CalendarClock className="size-4" /> Marcacion manual
            </Button>
          </div>
        </section>
      </div>

      {/* KPIs + log de turnos activos */}
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <KpiMini icono={Users} etiqueta="En turno" valor={`${jornadas.length} / ${(activos ?? []).length}`} acento="text-primary" />
          <KpiMini icono={Clock} etiqueta="Trabajando" valor={String(trabajando.length)} acento="text-primary" />
          <KpiMini icono={Coffee} etiqueta="En pausa" valor={String(enPausa.length)} acento="text-tertiary" />
        </div>

        <section className="rounded-xl border-l-2 border-primary bg-surface-high p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold uppercase tracking-wide">Turnos activos</h2>
            <span className="micro-label flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              En vivo
            </span>
          </div>

          {jornadas.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nadie tiene una jornada abierta ahora mismo.</p>
          ) : (
            <>
              {/* Telefono: tarjetas */}
              <ul className="mt-4 space-y-2 md:hidden">
                {jornadas.map((j) => (
                  <TarjetaJornadaAbierta key={j.id_jornada} jornada={j} />
                ))}
              </ul>

              {/* Tablet / desktop: tabla */}
              <table className="mt-4 hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="micro-label py-2 pr-3">Sts</th>
                    <th className="micro-label py-2 pr-4">Empleado</th>
                    <th className="micro-label py-2 pr-4">Inicio</th>
                    <th className="micro-label py-2 pr-4">Duracion</th>
                    <th className="micro-label py-2 pr-4">Tramo actual</th>
                    <th className="micro-label py-2 pl-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadas.map((j) => (
                    <FilaJornadaAbierta key={j.id_jornada} jornada={j} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <MarcacionManualDialog
        activos={activos ?? []}
        abiertas={jornadas}
        idInicial={idSel}
        abierto={manual}
        onCerrar={() => setManual(false)}
      />
    </div>
  )
}

// Marca entrada/salida con una fecha y hora especificas (correcciones/olvidos).
// El tipo (entrada/salida) lo sigue decidiendo el backend por alternancia.
function ahoraLocalInput(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function MarcacionManualDialog({
  activos,
  abiertas,
  idInicial,
  abierto,
  onCerrar,
}: {
  activos: Empleado[]
  abiertas: Jornada[]
  idInicial: string
  abierto: boolean
  onCerrar: () => void
}) {
  const marcar = useMarcar()
  const [idSel, setIdSel] = useState(idInicial)
  const [cuando, setCuando] = useState('')

  useEffect(() => {
    if (abierto) {
      setIdSel(idInicial)
      setCuando(ahoraLocalInput())
    }
  }, [abierto, idInicial])

  const jornadaSel = abiertas.find((j) => j.id_empleado_jornada === Number(idSel))
  const esSalida = ultimaMarcacion(jornadaSel ?? ({} as Jornada))?.tipo_marcacion === 'ENTRADA'
  const valido = idSel !== '' && cuando !== ''

  function registrar() {
    if (!valido) return
    marcar
      .mutateAsync({ idEmpleado: Number(idSel), fechaHora: new Date(cuando).toISOString() })
      .then((r) =>
        toast.success(r.marcacion.tipo_marcacion === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada'),
      )
      .then(() => onCerrar())
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Marcacion manual</DialogTitle>
          <DialogDescription>
            Registra una entrada o salida con fecha y hora especificas (correcciones u olvidos). Debe ser
            posterior a la ultima marca del empleado y no puede estar en el futuro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={idSel} onValueChange={setIdSel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elige un empleado" />
              </SelectTrigger>
              <SelectContent>
                {activos.map((e) => (
                  <SelectItem key={e.id_empleado} value={String(e.id_empleado)}>
                    {nombreEmpleado(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="marca-cuando">Fecha y hora</Label>
            <Input
              id="marca-cuando"
              type="datetime-local"
              value={cuando}
              max={ahoraLocalInput()}
              onChange={(e) => setCuando(e.target.value)}
            />
          </div>
          {idSel !== '' ? (
            <p className="text-xs text-muted-foreground">
              Se registrara como{' '}
              <span className={cn('font-semibold', esSalida ? 'text-tertiary' : 'text-primary')}>
                {esSalida ? 'SALIDA' : 'ENTRADA'}
              </span>{' '}
              para este empleado.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="btn-heat gap-2" disabled={!valido || marcar.isPending} onClick={registrar}>
            {marcar.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <>
      <p className="mt-1 font-heading text-5xl font-semibold tabular-nums tracking-tight text-primary md:text-6xl">
        {ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </p>
      <p className="micro-label mt-2 first-letter:uppercase">
        {ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </>
  )
}

function KpiMini({
  icono: Icono,
  etiqueta,
  valor,
  acento,
}: {
  icono: LucideIcon
  etiqueta: string
  valor: string
  acento: string
}) {
  return (
    <div className="rounded-xl bg-surface-high p-4">
      <p className="micro-label flex items-center gap-1.5">
        <Icono className="size-3.5" /> {etiqueta}
      </p>
      <p className={cn('mt-2 font-heading text-2xl font-semibold tabular-nums tracking-tight md:text-3xl', acento)}>
        {valor}
      </p>
    </div>
  )
}

// Logica compartida por la fila (desktop) y la tarjeta (telefono) de una
// jornada abierta: mutaciones + datos derivados + handlers.
function useJornadaAcciones(jornada: Jornada) {
  const cerrar = useCerrarJornada()
  const deshacer = useDeshacerMarcacion()
  const marcaciones = jornada.marcaciones ?? []
  const inicio = marcaciones[0]?.fecha_hora_marcacion
  const ultima = ultimaMarcacion(jornada)
  const trabajando = ultima?.tipo_marcacion === 'ENTRADA'
  const nombre = jornada.empleado ? nombreEmpleado(jornada.empleado) : `#${jornada.id_empleado_jornada}`

  const accion = (fn: Promise<unknown>, ok: string) =>
    fn.then(() => toast.success(ok)).catch((e: unknown) => toast.error(errorApi(e)))

  return {
    cerrar,
    deshacer,
    inicio,
    ultima,
    trabajando,
    nombre,
    onDeshacer: () => accion(deshacer.mutateAsync(jornada.id_jornada), 'Ultima marcacion deshecha'),
    onCerrar: () => accion(cerrar.mutateAsync(jornada.id_jornada), 'Jornada cerrada y liquidada'),
  }
}

// Tarjeta de jornada abierta para telefono.
function TarjetaJornadaAbierta({ jornada }: { jornada: Jornada }) {
  const { cerrar, deshacer, inicio, ultima, trabajando, nombre, onDeshacer, onCerrar } =
    useJornadaAcciones(jornada)

  return (
    <li className="rounded-xl bg-surface-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn('inline-block size-2.5 shrink-0 rounded-full', trabajando ? 'bg-primary' : 'bg-tertiary')}
            title={trabajando ? 'Trabajando' : 'En pausa'}
          />
          <span className="shrink-0 tabular-nums text-muted-foreground">{idCorto(jornada.id_empleado_jornada)}</span>
          <span className="truncate font-medium">{nombre}</span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md border px-2 py-0.5 text-xs tabular-nums',
            trabajando ? 'border-primary/40 text-primary' : 'border-tertiary/40 text-tertiary',
          )}
        >
          {trabajando ? 'Dentro' : 'Pausa'} {ultima ? horaCorta(ultima.fecha_hora_marcacion) : ''}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="micro-label tabular-nums">
          Inicio {inicio ? horaCorta(inicio) : '—'} · {inicio ? duracionDesde(inicio) : '—'}
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            title="Deshacer ultima marcacion"
            disabled={deshacer.isPending}
            onClick={onDeshacer}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={trabajando || cerrar.isPending}
            title={trabajando ? 'Marca la salida antes de cerrar' : 'Cerrar jornada y liquidar'}
            onClick={onCerrar}
          >
            <ClipboardList className="size-3.5" /> Cerrar
          </Button>
        </div>
      </div>
    </li>
  )
}

function FilaJornadaAbierta({ jornada }: { jornada: Jornada }) {
  const { cerrar, deshacer, inicio, ultima, trabajando, nombre, onDeshacer, onCerrar } =
    useJornadaAcciones(jornada)

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-3 pr-3">
        <span
          className={cn('inline-block size-2.5 rounded-full', trabajando ? 'bg-primary' : 'bg-tertiary')}
          title={trabajando ? 'Trabajando' : 'En pausa'}
        />
      </td>
      <td className="py-3 pr-4">
        <span className="tabular-nums text-muted-foreground">{idCorto(jornada.id_empleado_jornada)}</span>{' '}
        <span className="font-medium">{nombre}</span>
      </td>
      <td className="py-3 pr-4 tabular-nums text-muted-foreground">{inicio ? horaCorta(inicio) : '—'}</td>
      <td className="py-3 pr-4 tabular-nums">{inicio ? duracionDesde(inicio) : '—'}</td>
      <td className="py-3 pr-4">
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs tabular-nums',
            trabajando ? 'border-primary/40 text-primary' : 'border-tertiary/40 text-tertiary',
          )}
        >
          {trabajando ? 'Dentro' : 'Pausa'} {ultima ? horaCorta(ultima.fecha_hora_marcacion) : ''}
        </span>
      </td>
      <td className="py-3 pl-3">
        <div className="flex justify-end gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            title="Deshacer ultima marcacion"
            disabled={deshacer.isPending}
            onClick={onDeshacer}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={trabajando || cerrar.isPending}
            title={trabajando ? 'Marca la salida antes de cerrar' : 'Cerrar jornada y liquidar'}
            onClick={onCerrar}
          >
            <ClipboardList className="size-3.5" /> Cerrar
          </Button>
        </div>
      </td>
    </tr>
  )
}
