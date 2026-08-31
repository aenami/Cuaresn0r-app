import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Wallet } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import { useEsAdmin } from '@/stores/auth.store'
import { empleadoQuery, saldoEmpleadoQuery } from '@/features/nomina/api'
import { EmpleadoDialog } from '@/features/nomina/empleado-form-dialog'
import { Overview } from '@/features/nomina/empleado-overview'
import { Tarifas } from '@/features/nomina/empleado-tarifas'
import { LedgerCompleto } from '@/features/nomina/empleado-ledger'
import { Asistencia } from '@/features/nomina/empleado-asistencia'
import { PagoDialog } from '@/features/nomina/empleado-pago-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/empleados/$id')({
  component: PaginaEmpleado,
})

type Tab = 'overview' | 'tarifas' | 'ledger' | 'asistencia'

function PaginaEmpleado() {
  const { id } = Route.useParams()
  const idEmpleado = Number(id)
  const esAdmin = useEsAdmin()
  const { data: empleado, isPending, error } = useQuery(empleadoQuery(idEmpleado))
  const { data: saldo } = useQuery(saldoEmpleadoQuery(idEmpleado))
  const [tab, setTab] = useState<Tab>('overview')
  const [editar, setEditar] = useState(false)
  const [pagar, setPagar] = useState(false)

  if (isPending) {
    return <div className="mx-auto max-w-6xl p-6 md:p-10"><div className="h-40 animate-pulse rounded-2xl bg-surface-high" /></div>
  }
  if (error || !empleado) {
    return (
      <div className="mx-auto max-w-6xl p-6 md:p-10">
        <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : 'No se pudo cargar el empleado'}</p>
        <Link to="/nomina" className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Volver a nomina
        </Link>
      </div>
    )
  }

  const activo = empleado.estado_empleado === 'ACTIVO'

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <Link to="/nomina" className="micro-label inline-flex items-center gap-1.5 hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Nomina
      </Link>

      {/* Cabecera */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 font-heading text-2xl font-semibold text-primary">
            {empleado.nombre_empleado[0]}
            {empleado.apellido_empleado[0]}
          </div>
          <div>
            <div className="flex items-center gap-3">
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
                {activo ? 'Activo' : 'Retirado'}
              </span>
            </div>
            <p className="micro-label mt-1.5">
              EMP-ID: #{String(empleado.id_empleado).padStart(4, '0')} · Ingreso: {formatearFecha(empleado.fecha_ingreso_empleado)}
              {empleado.fecha_retiro_empleado ? ` · Retiro: ${formatearFecha(empleado.fecha_retiro_empleado)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {esAdmin ? (
            <Button variant="outline" className="h-10 gap-2" onClick={() => setEditar(true)}>
              <Pencil className="size-4" /> Editar
            </Button>
          ) : null}
          <Button
            className="btn-heat h-10 gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
            onClick={() => setPagar(true)}
          >
            <Wallet className="size-4" /> Registrar pago
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard titulo="Total devengado" valor={formatearPrecio(saldo?.totalDevengado ?? 0)} sub="Acumulado historico" acento="border-b-2 border-tertiary" />
        <KpiCard titulo="Total pagado" valor={formatearPrecio(saldo?.totalPagado ?? 0)} sub="Acumulado historico" acento="border-b-2 border-border" />
        <KpiCard
          titulo="Saldo pendiente"
          valor={formatearPrecio(saldo?.saldoPendiente ?? 0)}
          sub={Number(saldo?.saldoPendiente ?? 0) > 0 ? 'Se le debe al empleado' : 'Al dia'}
          acento="border border-primary"
          resaltar
        />
      </div>

      {/* Tabs (scroll horizontal en telefono para no cortarse) */}
      <div className="scrollbar-fina mt-8 flex items-center gap-6 overflow-x-auto border-b border-border">
        {([
          { id: 'overview', t: 'Resumen' },
          ...(esAdmin ? [{ id: 'tarifas' as const, t: 'Tarifas' }] : []),
          { id: 'ledger', t: 'Movimientos' },
          { id: 'asistencia', t: 'Asistencia' },
        ] as { id: Tab; t: string }[]).map((x) => (
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
        {tab === 'overview' ? (
          <Overview idEmpleado={idEmpleado} saldo={saldo} esAdmin={esAdmin} activo={activo} onPagar={() => setPagar(true)} />
        ) : tab === 'tarifas' ? (
          <Tarifas idEmpleado={idEmpleado} esAdmin={esAdmin} activo={activo} />
        ) : tab === 'ledger' ? (
          <LedgerCompleto idEmpleado={idEmpleado} saldo={saldo} />
        ) : (
          <Asistencia idEmpleado={idEmpleado} />
        )}
      </div>

      <EmpleadoDialog empleado={editar ? empleado : null} abierto={editar} onCerrar={() => setEditar(false)} />
      <PagoDialog
        idEmpleado={idEmpleado}
        saldo={Number(saldo?.saldoPendiente ?? 0)}
        abierto={pagar}
        onCerrar={() => setPagar(false)}
      />
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
      <p
        className={cn(
          'mt-2 font-heading text-3xl font-semibold tabular-nums tracking-tighter md:text-4xl',
          resaltar && 'text-primary',
        )}
      >
        {valor}
      </p>
      <p className="micro-label mt-2">{sub}</p>
    </div>
  )
}
