import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import type { TurnoResumen } from '@/types/api'
import { useEsAdmin, useEsCaja } from '@/stores/auth.store'
import { turnoActualQuery } from '@/features/billing/api'
import { cn } from '@/lib/utils'
import { horaCorta } from '@/features/billing/caja-comun'
import { AbrirTurnoForm, FlujoEfectivo } from '@/features/billing/flujo-efectivo'
import { CuentasPagadas } from '@/features/billing/cuentas-pagadas'
import { Ajustes } from '@/features/billing/ajustes-caja'

export const Route = createFileRoute('/_auth/caja')({
  component: PaginaCaja,
})

// Vistas del modulo. 'flujo' y 'cuentas' las ven cajero y admin; 'ajustes'
// (configuracion + cajas) es solo admin.
type Vista = 'flujo' | 'cuentas' | 'ajustes'

function PaginaCaja() {
  const esAdmin = useEsAdmin()
  const esCaja = useEsCaja()
  const { data: turno, isPending } = useQuery(turnoActualQuery)
  const [vista, setVista] = useState<Vista>('flujo')

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="micro-label tracking-[0.22em]">Caja_Control</p>
        <div className="flex items-center gap-3">
          <ToggleModo vista={vista} onCambiar={setVista} esAdmin={esAdmin} />
          {turno && vista === 'flujo' && <PillTurno turno={turno} />}
        </div>
      </div>

      {vista === 'ajustes' && esAdmin ? (
        <Ajustes />
      ) : vista === 'cuentas' ? (
        <CuentasPagadas />
      ) : isPending ? (
        <div className="h-72 animate-pulse rounded-2xl bg-surface-high" />
      ) : turno ? (
        <FlujoEfectivo turno={turno} />
      ) : (
        <AbrirTurnoForm />
      )}
    </div>
  )
}

function ToggleModo({ vista, onCambiar, esAdmin }: { vista: Vista; onCambiar: (v: Vista) => void; esAdmin: boolean }) {
  const opciones: { valor: Vista; texto: string }[] = [
    { valor: 'flujo', texto: 'Flujo de caja' },
    { valor: 'cuentas', texto: 'Cuentas' },
    ...(esAdmin ? [{ valor: 'ajustes' as const, texto: 'Ajustes' }] : []),
  ]
  return (
    <div className="inline-flex rounded-lg bg-surface-lowest p-0.5">
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
