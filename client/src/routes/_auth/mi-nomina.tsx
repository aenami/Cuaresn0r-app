import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock, Download, Info } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { useAuthStore } from '@/stores/auth.store'
import { miNominaQuery } from '@/features/nomina/api'
import { construirLedger, quincenaActual } from '@/features/nomina/ledger'
import { LedgerLista } from '@/features/nomina/ledger-lista'
import type { MiNominaResumen } from '@/types/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/mi-nomina')({
  component: PaginaMiNomina,
})

type Tab = 'resumen' | 'movimientos' | 'asistencia'

function PaginaMiNomina() {
  const rolNombre = useAuthStore((s) => s.usuario?.rolNombre)
  const { data, isPending, error } = useQuery(miNominaQuery)
  const [tab, setTab] = useState<Tab>('resumen')

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-high" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-10">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'No se pudo cargar tu nomina'}
        </p>
      </div>
    )
  }

  const { empleado, saldo } = data
  const activo = empleado.estado_empleado === 'ACTIVO'
  const pendiente = Number(saldo.saldoPendiente)

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <p className="micro-label">Autoservicio</p>

      {/* Cabecera */}
      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 font-heading text-2xl font-semibold text-primary">
            {empleado.nombre_empleado[0]}
            {empleado.apellido_empleado[0]}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-3xl font-semibold uppercase tracking-tight">
                {empleado.nombre_empleado} {empleado.apellido_empleado}
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  activo ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
                )}
              >
                <span className={cn('size-1.5 rounded-full', activo ? 'bg-primary' : 'bg-muted-foreground')} />
                {rolNombre ?? 'Empleado'}
              </span>
            </div>
            <p className="micro-label mt-1.5">
              EMP-ID: #{String(empleado.id_empleado).padStart(4, '0')} · Ingreso:{' '}
              {formatearFecha(empleado.fecha_ingreso_empleado)}
            </p>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard titulo="Total devengado" valor={formatearPrecio(saldo.totalDevengado)} sub="Acumulado historico" acento="border-b-2 border-tertiary" />
        <KpiCard titulo="Total pagado" valor={formatearPrecio(saldo.totalPagado)} sub="Acumulado historico" acento="border-b-2 border-border" />
        <KpiCard
          titulo="Saldo a favor"
          valor={formatearPrecio(saldo.saldoPendiente)}
          sub={pendiente > 0 ? 'Te lo deben' : 'Al dia'}
          acento="border border-primary"
          resaltar
        />
      </div>

      {/* Tabs (scroll horizontal en telefono para no cortarse) */}
      <div className="scrollbar-fina mt-8 flex items-center gap-6 overflow-x-auto border-b border-border">
        {(
          [
            { id: 'resumen', t: 'Resumen' },
            { id: 'movimientos', t: 'Movimientos' },
            { id: 'asistencia', t: 'Asistencia' },
          ] as { id: Tab; t: string }[]
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 text-sm font-semibold uppercase tracking-wide transition-colors',
              tab === x.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {x.t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'resumen' ? (
          <Resumen data={data} />
        ) : tab === 'movimientos' ? (
          <Movimientos data={data} />
        ) : (
          <Asistencia data={data} />
        )}
      </div>
    </div>
  )
}

function KpiCard({
  titulo,
  valor,
  sub,
  acento,
  resaltar,
}: {
  titulo: string
  valor: string
  sub: string
  acento: string
  resaltar?: boolean
}) {
  return (
    <div className={cn('rounded-xl bg-surface-high p-5', acento)}>
      <p className="micro-label">{titulo}</p>
      <p className={cn('mt-2 font-heading text-3xl font-semibold tabular-nums tracking-tighter md:text-4xl', resaltar && 'text-primary')}>
        {valor}
      </p>
      <p className="micro-label mt-2">{sub}</p>
    </div>
  )
}

// ---- Tab: Resumen ----

function Resumen({ data }: { data: MiNominaResumen }) {
  const ledger = useMemo(() => construirLedger(data.saldo.devengos, data.pagos).slice(0, 6), [data])
  const quincena = useMemo(() => quincenaActual(data.saldo.devengos), [data])

  const valorHora = Number(data.tarifaActiva?.valor_hora_tarifaEmpleado ?? 0)
  const pctRecargo = Number(data.recargoNocturno?.porcentaje ?? 0)
  const valorNocturno = valorHora * (1 + pctRecargo / 100)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* Columna principal */}
      <div className="space-y-6">
        <section className="rounded-xl bg-surface-high">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="micro-label">Movimientos recientes</h2>
          </div>
          {ledger.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Sin movimientos todavia.</p>
          ) : (
            <LedgerLista filas={ledger} />
          )}
        </section>

        <section className="rounded-xl bg-surface-high p-5">
          <div className="flex items-center justify-between">
            <h2 className="micro-label">Mi tarifa</h2>
            {data.tarifaActiva ? (
              <span className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Vigente
              </span>
            ) : null}
          </div>
          {data.tarifaActiva ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-lowest p-4">
                  <p className="micro-label">Hora estandar</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
                    {formatearPrecio(valorHora)}
                    <span className="text-sm font-normal text-muted-foreground"> /h</span>
                  </p>
                </div>
                <div className="rounded-lg bg-surface-lowest p-4">
                  <p className="micro-label">{pctRecargo > 0 ? `Hora nocturna (+${pctRecargo}%)` : 'Hora nocturna'}</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-tertiary">
                    {formatearPrecio(valorNocturno)}
                    <span className="text-sm font-normal text-muted-foreground"> /h</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Vigente desde {formatearFecha(data.tarifaActiva.fecha_inicio_tarifaEmpleado)}.
                {pctRecargo === 0 ? ' Sin recargo nocturno configurado.' : ''}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Aun no tienes una tarifa asignada. Consultalo con tu administrador.
            </p>
          )}
        </section>
      </div>

      {/* Columna lateral */}
      <div className="space-y-6">
        <section className="rounded-xl border-t-2 border-primary bg-surface-high p-5">
          <p className="micro-label">
            Periodo actual · {quincena.inicio.slice(5)} a {quincena.fin.slice(5)}
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <FilaDato etiqueta="Horas ordinarias" valor={`${quincena.ordinarias.toFixed(1)} h`} />
            <FilaDato etiqueta="Horas nocturnas" valor={`${quincena.nocturnas.toFixed(1)} h`} acento="text-tertiary" />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="micro-label">Devengado en la quincena</span>
            <span className="font-heading text-lg font-semibold tabular-nums text-primary">{formatearPrecio(quincena.monto)}</span>
          </div>
        </section>

        <section className="rounded-xl border border-dashed border-border p-5">
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Esta es tu informacion de solo lectura. Las marcaciones de entrada/salida y los pagos los
              registra el cajero de turno.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function FilaDato({ etiqueta, valor, acento }: { etiqueta: string; valor: string; acento?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={cn('tabular-nums', acento)}>{valor}</span>
    </div>
  )
}

// ---- Tab: Movimientos (cuenta corriente completa + export) ----

function Movimientos({ data }: { data: MiNominaResumen }) {
  const ledger = useMemo(() => construirLedger(data.saldo.devengos, data.pagos), [data])

  function exportarCSV() {
    const filas = [
      ['Fecha', 'Tipo', 'Descripcion', 'Monto', 'Saldo'],
      ...ledger.map((f) => [f.fecha.slice(0, 10), f.tipo, f.descripcion, f.monto.toFixed(2), f.balance.toFixed(2)]),
    ]
    const csv = filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `mi_nomina_${data.empleado.id_empleado}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl bg-surface-high">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="micro-label">Mi cuenta corriente</h2>
        {ledger.length > 0 ? (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={exportarCSV}>
            <Download className="size-4" /> Exportar
          </Button>
        ) : null}
      </div>
      {ledger.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Sin movimientos todavia.</p>
      ) : (
        <LedgerLista filas={ledger} />
      )}
    </section>
  )
}

// ---- Tab: Asistencia (mis jornadas) ----

function Asistencia({ data }: { data: MiNominaResumen }) {
  const jornadas = data.jornadas

  if (jornadas.length === 0) return <p className="text-sm text-muted-foreground">Sin jornadas registradas.</p>

  return (
    <ul className="space-y-3">
      {jornadas.map((j) => {
        const marcas = j.marcaciones ?? []
        const abierta = j.estado_jornada === 'ABIERTA'
        return (
          <li key={j.id_jornada} className="rounded-xl bg-surface-high p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <span className="font-heading font-semibold tabular-nums">{formatearFecha(j.fecha_jornada)}</span>
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    abierta ? 'border-tertiary/40 text-tertiary' : 'border-border text-muted-foreground',
                  )}
                >
                  {abierta ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <span className="micro-label">
                {marcas.length} {marcas.length === 1 ? 'marcacion' : 'marcaciones'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {marcas.map((m) => (
                <span
                  key={m.id_marcacion}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs tabular-nums',
                    m.tipo_marcacion === 'ENTRADA' ? 'bg-primary/10 text-primary' : 'bg-surface-lowest text-muted-foreground',
                  )}
                >
                  <Clock className="size-3" />
                  {m.tipo_marcacion === 'ENTRADA' ? '↓' : '↑'}{' '}
                  {new Date(m.fecha_hora_marcacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
