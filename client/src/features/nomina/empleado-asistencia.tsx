import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock } from 'lucide-react'
import { formatearFecha } from '@/lib/formato'
import { jornadasQuery } from '@/features/nomina/api'
import { cn } from '@/lib/utils'

export function Asistencia({ idEmpleado }: { idEmpleado: number }) {
  const { data: jornadas, isPending } = useQuery(jornadasQuery({ empleado: idEmpleado }))

  if (isPending) return <p className="text-sm text-muted-foreground">Cargando jornadas…</p>
  if ((jornadas ?? []).length === 0) return <p className="text-sm text-muted-foreground">Sin jornadas registradas.</p>

  return (
    <ul className="space-y-3">
      {(jornadas ?? []).map((j) => {
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
