import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Croissant } from 'lucide-react'
import { turnoActualQuery } from '@/features/billing/api'
import { errorApi } from '@/features/billing/caja-comun'
import { VentaPanaderia } from '@/features/panaderia/venta'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_auth/panaderia')({ component: PaginaPanaderia })

function PaginaPanaderia() {
  const navigate = useNavigate()
  const { data: turno, error, isPending, refetch } = useQuery(turnoActualQuery)
  return <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="flex items-center gap-3 font-heading text-3xl font-semibold"><Croissant className="size-7 text-primary" />Venta de mostrador</h1><p className="mt-2 text-sm text-muted-foreground">Panadería · panes, pastelería y productos externos.</p></div>
      <Link to="/caja" className="text-sm text-primary hover:underline">Caja y cuadre →</Link>
    </header>
    {error ? <div role="alert" className="space-y-3 rounded-lg bg-surface-high p-5"><p>{errorApi(error)}</p><Button onClick={() => void refetch()}>Reintentar</Button></div>
      : isPending ? <p role="status">Consultando tu turno…</p>
        : <VentaPanaderia turno={turno ?? null} onIrCaja={() => void navigate({ to: '/caja' })} />}
  </div>
}
