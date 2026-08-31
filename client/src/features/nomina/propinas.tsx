import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, Coins, Landmark, Loader2, Scale, Settings2, TriangleAlert, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatearPrecio } from '@/lib/formato'
import {
  propinasConfigQuery,
  propinasPreviewQuery,
  useDeshacerPropinas,
  useGuardarPropinasConfig,
  useRepartirPropinas,
} from '@/features/nomina/api'
import type { MetodoReparto, PropinasPreview } from '@/types/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorApi } from './comun'

function hoyYmd(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function Propinas() {
  const [fecha, setFecha] = useState(hoyYmd())
  const [metodo, setMetodo] = useState<MetodoReparto>('IGUALES')
  const [excluidos, setExcluidos] = useState<number[]>([])

  // Retencion del local: el control vive aca para que su valor alimente en vivo
  // la preview Y el reparto (lo que se ve es lo que se reparte). La config
  // guardada es el valor por defecto que se carga y que "Guardar" persiste.
  const { data: config } = useQuery(propinasConfigQuery)
  const guardarConfig = useGuardarPropinasConfig()
  const [retiene, setRetiene] = useState(false)
  const [pct, setPct] = useState('')
  useEffect(() => {
    if (!config) return
    setRetiene(config.retiene_casa)
    setPct(config.porcentaje_casa ? String(Number(config.porcentaje_casa)) : '')
  }, [config])

  const pctNum = Number(pct)
  const pctValido = pct !== '' && !Number.isNaN(pctNum) && pctNum > 0 && pctNum <= 100
  const pctEfectivo = retiene && pctValido ? pctNum : 0

  const savedRetiene = config?.retiene_casa ?? false
  const savedPct = config?.retiene_casa && config?.porcentaje_casa ? Number(config.porcentaje_casa) : 0
  const objetivoValido = !retiene || pctValido
  const puedeGuardar = objetivoValido && (retiene !== savedRetiene || (retiene && pctNum !== savedPct))

  const excluidosActivos = metodo === 'IGUALES' ? excluidos : []
  const { data, isPending, isError } = useQuery(propinasPreviewQuery(fecha, metodo, excluidosActivos, pctEfectivo))
  const repartir = useRepartirPropinas()
  const deshacer = useDeshacerPropinas()

  const yaRepartido = data?.repartoExistente ?? null

  function toggleExcluir(id: number) {
    setExcluidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function onGuardarRetencion() {
    if (!puedeGuardar) return
    const datos = retiene && pctValido ? { retieneCasa: true, porcentajeCasa: pctNum } : { retieneCasa: false }
    guardarConfig
      .mutateAsync(datos)
      .then(() => toast.success('Retencion guardada como predeterminada'))
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  function onRepartir() {
    repartir
      .mutateAsync({ fecha, metodo, excluidos: excluidosActivos, pctCasa: pctEfectivo })
      .then((r) => toast.success(`Propinas repartidas entre ${r.empleados} empleado(s)`))
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  function onDeshacer() {
    deshacer
      .mutateAsync(fecha)
      .then(() => toast.success('Reparto deshecho'))
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">Propinas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Reparte el servicio cobrado a los clientes ese dia entre los empleados que trabajaron. Se suma
          al saldo de nomina de cada uno y se paga con el flujo de pagos.
        </p>
      </header>

      {/* Configuracion: retencion del restaurante (se aplica al reparto en vivo) */}
      <RetencionCasa
        className="mb-6"
        retiene={retiene}
        pct={pct}
        pctValido={pctValido}
        puedeGuardar={puedeGuardar}
        guardando={guardarConfig.isPending}
        onToggle={() => setRetiene((v) => !v)}
        onPct={setPct}
        onGuardar={onGuardarRetencion}
      />

      {/* Controles: fecha + metodo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label className="micro-label mb-1.5 block">Dia</Label>
          <input
            type="date"
            value={fecha}
            max={hoyYmd()}
            onChange={(e) => {
              setFecha(e.target.value)
              setExcluidos([])
            }}
            className="rounded-md border border-border bg-surface-high px-3 py-2 text-sm text-foreground [color-scheme:dark]"
          />
        </div>

        {!yaRepartido && (
          <div className="flex items-center gap-1 rounded-lg bg-surface-lowest p-0.5">
            <BotonMetodo activo={metodo === 'IGUALES'} onClick={() => setMetodo('IGUALES')} icono={Scale}>
              Partes iguales
            </BotonMetodo>
            <BotonMetodo activo={metodo === 'PRESENCIA'} onClick={() => setMetodo('PRESENCIA')} icono={Clock}>
              Por presencia
            </BotonMetodo>
          </div>
        )}
      </div>

      {isError ? (
        <p className="mt-8 text-sm text-destructive">No se pudo cargar el reparto de propinas.</p>
      ) : isPending || !data ? (
        <p className="mt-8 text-sm text-muted-foreground">Calculando…</p>
      ) : (
        <>
          {/* Resumen del dia */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TarjetaPropina etiqueta="Propinas del dia" valor={formatearPrecio(data.pool)} acento="primary" />
            <TarjetaPropina etiqueta="Cuentas con propina" valor={String(data.cuentasConPropina)} />
            <TarjetaPropina etiqueta="Trabajaron" valor={String(data.trabajaron)} />
            {yaRepartido ? (
              <TarjetaPropina etiqueta="Repartido" valor={formatearPrecio(yaRepartido.total)} acento="primary" />
            ) : (
              <TarjetaPropina
                etiqueta="Sin asignar"
                valor={formatearPrecio(data.sinAsignar)}
                acento={data.sinAsignar > 0 ? 'tertiary' : 'muted'}
              />
            )}
          </div>

          {/* Retencion del local (solo en la preview; ya repartido conserva el
              snapshot en sus devengos). */}
          {!yaRepartido && data.porcentajeCasa > 0 && data.pool > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tertiary/30 bg-tertiary/5 px-4 py-3">
              <p className="text-sm">
                <Landmark className="mr-1.5 inline size-4 text-tertiary" />
                El restaurante retiene el{' '}
                <span className="font-semibold text-tertiary">{data.porcentajeCasa}%</span>:{' '}
                <span className="font-semibold tabular-nums">{formatearPrecio(data.retencionCasa)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Repartible entre empleados:{' '}
                <span className="font-semibold text-foreground tabular-nums">{formatearPrecio(data.repartible)}</span>
              </p>
            </div>
          ) : null}

          {yaRepartido ? (
            <RepartoHecho reparto={yaRepartido} onDeshacer={onDeshacer} deshaciendo={deshacer.isPending} />
          ) : (
            <RepartoPreview
              data={data}
              metodo={metodo}
              excluidos={excluidos}
              onToggleExcluir={toggleExcluir}
              onRepartir={onRepartir}
              repartiendo={repartir.isPending}
              diaFinalizado={data.diaFinalizado}
            />
          )}
        </>
      )}
    </div>
  )
}

// Control de la retencion del restaurante (presentacional; el estado vive en
// Propinas para alimentar la preview/reparto en vivo). Toggle + %; el cambio se
// refleja de inmediato en el reparto de abajo, y "Guardar" lo deja como
// predeterminado (config versionada).
function RetencionCasa({
  className,
  retiene,
  pct,
  pctValido,
  puedeGuardar,
  guardando,
  onToggle,
  onPct,
  onGuardar,
}: {
  className?: string
  retiene: boolean
  pct: string
  pctValido: boolean
  puedeGuardar: boolean
  guardando: boolean
  onToggle: () => void
  onPct: (v: string) => void
  onGuardar: () => void
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface-low p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-high">
            <Landmark className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Retencion del restaurante</p>
            <p className="micro-label">
              {retiene ? 'El local se queda con un % de cada propina' : 'El local no retiene propinas'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={retiene}
            aria-label="Activar retencion del restaurante"
            onClick={onToggle}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 ease-out-quart',
              retiene ? 'bg-primary' : 'bg-surface-lowest',
            )}
          >
            <span
              className={cn(
                'block size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out-quart',
                retiene ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>

          <div className={cn('flex items-center gap-1.5', !retiene && 'pointer-events-none opacity-40')}>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              inputMode="decimal"
              placeholder="10"
              aria-label="Porcentaje de retencion"
              value={pct}
              onChange={(e) => onPct(e.target.value)}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>

          <Button
            variant="secondary"
            className="gap-2"
            disabled={!puedeGuardar || guardando}
            onClick={onGuardar}
          >
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
            Guardar
          </Button>
        </div>
      </div>

      {retiene && !pctValido ? (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Ingresa un porcentaje entre 1 y 100 para aplicar la retencion.
        </p>
      ) : puedeGuardar ? (
        <p className="mt-2.5 text-xs text-tertiary">
          Ya se refleja en el reparto de abajo. Pulsa “Guardar” para dejarlo como predeterminado.
        </p>
      ) : null}
    </section>
  )
}

function BotonMetodo({
  activo,
  onClick,
  icono: Icono,
  children,
}: {
  activo: boolean
  onClick: () => void
  icono: LucideIcon
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
        activo ? 'bg-surface-high text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icono className="size-3.5" /> {children}
    </button>
  )
}

function TarjetaPropina({
  etiqueta,
  valor,
  acento = 'muted',
}: {
  etiqueta: string
  valor: string
  acento?: 'primary' | 'tertiary' | 'muted'
}) {
  const color = acento === 'primary' ? 'text-primary' : acento === 'tertiary' ? 'text-tertiary' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-surface-low p-4">
      <p className="micro-label">{etiqueta}</p>
      <p className={cn('mt-2 font-heading text-xl font-bold tabular-nums sm:text-2xl', color)}>{valor}</p>
    </div>
  )
}

function RepartoPreview({
  data,
  metodo,
  excluidos,
  onToggleExcluir,
  onRepartir,
  repartiendo,
  diaFinalizado,
}: {
  data: PropinasPreview
  metodo: MetodoReparto
  excluidos: number[]
  onToggleExcluir: (id: number) => void
  onRepartir: () => void
  repartiendo: boolean
  diaFinalizado: boolean
}) {
  if (data.pool <= 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
        <Coins className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-heading text-lg font-semibold">Sin propinas ese dia</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          No hay servicio cobrado en cuentas pagadas de ese dia para repartir.
        </p>
      </div>
    )
  }

  const hayReparto = data.asignaciones.some((a) => a.monto > 0)

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs text-muted-foreground">
        {metodo === 'PRESENCIA'
          ? 'Cada propina se reparte entre quienes tenian jornada abierta cuando se abrio ese pedido.'
          : 'El total se reparte en partes iguales entre los seleccionados.'}
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-surface-low">
        <ul className="divide-y divide-border">
          {data.asignaciones.map((a) => {
            const incluido = !excluidos.includes(a.idEmpleado)
            return (
              <li key={a.idEmpleado} className="flex items-center gap-3 px-4 py-3">
                {metodo === 'IGUALES' ? (
                  <input
                    type="checkbox"
                    checked={incluido}
                    onChange={() => onToggleExcluir(a.idEmpleado)}
                    className="size-4 accent-primary"
                    aria-label={`Incluir a ${a.nombre}`}
                  />
                ) : null}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm font-medium',
                    (!incluido || a.monto === 0) && 'text-muted-foreground',
                  )}
                >
                  {a.nombre}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    a.monto > 0 && incluido ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {formatearPrecio(metodo === 'IGUALES' && !incluido ? 0 : a.monto)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {data.sinAsignar > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-tertiary">
          <TriangleAlert className="size-3.5" />
          {formatearPrecio(data.sinAsignar)} sin asignar
          {metodo === 'PRESENCIA' ? ' (propinas de momentos sin nadie marcado)' : ' (redondeo)'}.
        </p>
      )}

      {!diaFinalizado && (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-tertiary/30 bg-tertiary/5 px-4 py-3 text-sm text-tertiary">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>
            El dia aun no termina. Las propinas de hoy se podran repartir a partir de manana, cuando ya
            esten todas las cuentas del dia (esto es solo una vista previa en vivo).
          </span>
        </p>
      )}

      <div className="mt-5">
        <Button
          className="btn-heat"
          onClick={onRepartir}
          disabled={repartiendo || !hayReparto || !diaFinalizado}
        >
          {repartiendo ? 'Repartiendo…' : 'Repartir propinas'}
        </Button>
      </div>
    </div>
  )
}

function RepartoHecho({
  reparto,
  onDeshacer,
  deshaciendo,
}: {
  reparto: NonNullable<PropinasPreview['repartoExistente']>
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold text-primary">Ya repartido</span>
          <span className="text-muted-foreground">
            {' '}· {formatearPrecio(reparto.total)} entre {reparto.empleados} empleado(s)
          </span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeshacer}
          disabled={deshaciendo || reparto.pagado}
          className="text-muted-foreground hover:text-destructive"
          title={reparto.pagado ? 'No se puede deshacer: algun empleado ya cobro' : 'Deshacer el reparto'}
        >
          <Undo2 className="size-4" /> Deshacer
        </Button>
      </div>
      {reparto.pagado && (
        <p className="mt-2 text-xs text-muted-foreground">
          Algun empleado ya cobro parte de estas propinas, por eso el reparto no se puede deshacer.
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface-low">
        <ul className="divide-y divide-border">
          {reparto.detalle.map((d) => (
            <li key={d.idEmpleado} className="flex items-center justify-between px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.nombre}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatearPrecio(d.monto)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
