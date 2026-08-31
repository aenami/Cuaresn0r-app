import type { LucideIcon } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

// Tarjetas/filas de resumen compartidas por las vistas de flujo y cuentas.

export function KpiCard({
  icono: Icono,
  titulo,
  valor,
  sub,
  acento,
}: {
  icono: LucideIcon
  titulo: string
  valor: string
  sub: string
  acento: string
}) {
  return (
    <div className={cn('rounded-xl bg-surface-high p-5', acento)}>
      <p className="micro-label flex items-center gap-1.5">
        <Icono className="size-3.5" /> {titulo}
      </p>
      <p className="mt-2 font-heading text-3xl font-semibold tabular-nums tracking-tighter md:text-4xl">{valor}</p>
      <p className="micro-label mt-2">{sub}</p>
    </div>
  )
}

export function FilaResumen({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="tabular-nums">{formatearPrecio(valor)}</span>
    </div>
  )
}
