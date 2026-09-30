import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import type { TurnoResumen } from '@/types/api'
import { useEsAdmin, useEsCaja, useEsGlobal, useAreaTrabajo } from '@/stores/auth.store'
import { turnoActualQuery, turnoQuery } from '@/features/billing/api'
import { cn } from '@/lib/utils'
import { horaCorta } from '@/features/billing/caja-comun'
import { AbrirTurnoForm, FlujoEfectivo } from '@/features/billing/flujo-efectivo'
import { CuadreCaja } from '@/features/billing/cuadre-caja'
import { CuentasPagadas } from '@/features/billing/cuentas-pagadas'
import { Ajustes } from '@/features/billing/ajustes-caja'
import { Directorio } from '@/features/nomina/directorio'
import { HistorialVentasPanaderia } from '@/features/panaderia/historial-ventas'
import { errorApi } from '@/features/billing/caja-comun'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/caja')({
  component: PaginaCaja,
})

// Vistas del modulo. 'flujo' y 'cuentas' las ven cajero y admin; 'ajustes'
// (configuracion + cajas) es solo admin.
type Vista = 'flujo' | 'cuadre' | 'cuentas' | 'ajustes' | 'personal'

function PaginaCaja() {
  const esAdmin = useEsAdmin()
  const esCaja = useEsCaja()
  const esGlobal = useEsGlobal()
  const area = useAreaTrabajo()
  const { data: turno, isPending, error, refetch } = useQuery({ ...turnoActualQuery, enabled: esCaja })
  const [vista, setVista] = useState<Vista>('flujo')
  const [idTurnoAjeno, setIdTurnoAjeno] = useState<number | null>(null)
  const {
    data: turnoAjeno,
    isPending: cargandoTurnoAjeno,
    error: errorTurnoAjeno,
    refetch: reintentarTurnoAjeno,
  } = useQuery({
    ...turnoQuery(idTurnoAjeno ?? 0),
    enabled: esAdmin && !esGlobal && vista === 'cuadre' && !turno && idTurnoAjeno !== null,
  })

  if (esGlobal) return <div className="p-6 md:p-10"><p className="mb-5 text-sm text-muted-foreground">Cierres de {area === 'PANADERIA' ? 'panadería' : 'restaurante'} · vista de supervisión</p><CuadreCaja turno={null} /></div>
  if (!esCaja) {
    return (
      <div className="grid min-h-full place-items-center p-10 text-center">
        <div>
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Solo cajeros y administradores acceden a la caja.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">Caja · {area === 'PANADERIA' ? 'Panadería' : 'Restaurante'}</p>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <ToggleModo vista={vista} onCambiar={setVista} esAdmin={esAdmin} />
          {turno && (vista === 'flujo' || vista === 'cuadre') && <PillTurno turno={turno} />}
        </div>
      </div>

      {vista === 'ajustes' && esAdmin ? (
        <Ajustes />
      ) : vista === 'cuentas' ? (
        area === 'PANADERIA' ? <HistorialVentasPanaderia /> : <CuentasPagadas />
      ) : vista === 'personal' ? (
        <Directorio esAdmin={false} />
      ) : error ? (
        <div role="alert" className="space-y-3 text-sm"><p className="text-destructive">{errorApi(error)}</p><Button variant="secondary" onClick={() => void refetch()}>Reintentar consulta del turno</Button></div>
      ) : vista === 'cuadre' ? (
        isPending || (!turno && idTurnoAjeno !== null && cargandoTurnoAjeno) ? (
          <div className="h-72 animate-pulse rounded-2xl bg-surface-high" />
        ) : !turno && idTurnoAjeno !== null && errorTurnoAjeno ? (
          <div role="alert" className="space-y-3 text-sm">
            <p className="text-destructive">No se pudo cargar el turno ocupado: {errorApi(errorTurnoAjeno)}</p>
            <Button variant="secondary" onClick={() => void reintentarTurnoAjeno()}>Reintentar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!turno && idTurnoAjeno !== null ? (
              <Button variant="ghost" size="sm" onClick={() => { setIdTurnoAjeno(null); setVista('flujo') }}>
                ← Volver a apertura de caja
              </Button>
            ) : null}
            <CuadreCaja turno={turno ?? (turnoAjeno?.estado_turno === 'ABIERTO' ? turnoAjeno : null)} />
          </div>
        )
      ) : isPending ? (
        <div className="h-72 animate-pulse rounded-2xl bg-surface-high" />
      ) : turno ? (
        <FlujoEfectivo turno={turno} />
      ) : (
        <AbrirTurnoForm
          esAdmin={esAdmin && !esGlobal}
          onRevisarTurno={(idTurno) => { setIdTurnoAjeno(idTurno); setVista('cuadre') }}
        />
      )}
    </div>
  )
}

function ToggleModo({ vista, onCambiar, esAdmin }: { vista: Vista; onCambiar: (v: Vista) => void; esAdmin: boolean }) {
  const opciones: { valor: Vista; texto: string }[] = [
    { valor: 'flujo', texto: 'Flujo de caja' },
    { valor: 'cuadre', texto: 'Cuadre' },
    { valor: 'cuentas', texto: 'Cuentas' },
    { valor: 'personal', texto: 'Pagos a personal' },
    ...(esAdmin ? [{ valor: 'ajustes' as const, texto: 'Ajustes' }] : []),
  ]
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-surface-lowest p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={vista === o.valor}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            'rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 ease-out-quart',
            vista === o.valor ? 'bg-surface-high text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

function PillTurno({ turno }: { turno: TurnoResumen }) {
  return (
    <span className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span className="micro-label !text-primary">Turno activo · desde {horaCorta(turno.fecha_apertura_turno)}</span>
    </span>
  )
}
