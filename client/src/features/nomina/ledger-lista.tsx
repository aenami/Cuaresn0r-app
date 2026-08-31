import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/utils'
import type { FilaLedger, TipoFila } from '@/features/nomina/ledger'

function TipoBadge({ tipo }: { tipo: TipoFila }) {
  const estilo =
    tipo === 'PAGO'
      ? 'border-border text-muted-foreground'
      : tipo === 'DEDUCCION'
        ? 'border-destructive/40 text-destructive'
        : 'border-tertiary/40 text-tertiary'
  const texto = tipo === 'PAGO' ? 'Pago' : tipo === 'DEDUCCION' ? 'Deduccion' : 'Devengo'
  return <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', estilo)}>{texto}</span>
}

// Ledger (devengos + pagos) responsive: tarjetas apiladas en telefono, tabla
// con columnas alineadas desde `md`. Lo comparten el perfil del ADMIN y el
// autoservicio del empleado.
export function LedgerLista({ filas }: { filas: FilaLedger[] }) {
  return (
    <>
      {/* Telefono */}
      <ul className="divide-y divide-border/40 md:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TipoBadge tipo={f.tipo} />
                <span className="micro-label tabular-nums">{formatearFecha(f.fecha)}</span>
              </div>
              <p className="mt-1.5 text-sm">{f.descripcion}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn('font-semibold tabular-nums', f.monto < 0 ? 'text-muted-foreground' : 'text-tertiary')}>
                {f.monto < 0 ? '−' : '+'}
                {formatearPrecio(Math.abs(f.monto))}
              </p>
              <p className="micro-label mt-0.5 tabular-nums">Saldo {formatearPrecio(f.balance)}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet / desktop */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="micro-label py-2 pl-5 pr-3">Fecha</th>
            <th className="micro-label py-2 pr-3">Tipo</th>
            <th className="micro-label py-2 pr-3">Descripcion</th>
            <th className="micro-label py-2 pr-3 text-right">Monto</th>
            <th className="micro-label py-2 pl-3 pr-5 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-border/40 last:border-0">
              <td className="py-3 pl-5 pr-3 tabular-nums text-muted-foreground">{formatearFecha(f.fecha)}</td>
              <td className="py-3 pr-3">
                <TipoBadge tipo={f.tipo} />
              </td>
              <td className="py-3 pr-3">{f.descripcion}</td>
              <td className={cn('py-3 pr-3 text-right font-semibold tabular-nums', f.monto < 0 ? 'text-muted-foreground' : 'text-tertiary')}>
                {f.monto < 0 ? '−' : '+'}
                {formatearPrecio(Math.abs(f.monto))}
              </td>
              <td className="py-3 pl-3 pr-5 text-right tabular-nums">{formatearPrecio(f.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
