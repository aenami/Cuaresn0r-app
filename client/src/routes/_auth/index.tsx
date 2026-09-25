import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowRight, Grid2x2 } from 'lucide-react'
import { useAuthStore, useEsAdmin } from '@/stores/auth.store'
import { DashboardReportes } from '@/features/reportes/dashboard'

export const Route = createFileRoute('/_auth/')({
  beforeLoad: () => {
    // El mesero opera desde el salon: su vista inicial son los pedidos y fichas.
    if (useAuthStore.getState().usuario?.rolNombre === 'MESERO') {
      throw redirect({ to: '/mesas' })
    }
    if (useAuthStore.getState().usuario?.rolNombre === 'CAJERO' && useAuthStore.getState().usuario?.area === 'PANADERIA') {
      throw redirect({ to: '/panaderia' })
    }
  },
  component: PaginaInicio,
})

function PaginaInicio() {
  const esAdmin = useEsAdmin()
  // El dashboard de analitica es la home solo para el ADMIN; los demas roles
  // ven una bienvenida minima que los lleva a operar.
  return esAdmin ? <DashboardReportes /> : <BienvenidaSimple />
}

function BienvenidaSimple() {
  const usuario = useAuthStore((s) => s.usuario)
  return (
    <div className="p-6 md:p-10">
      <p className="micro-label mb-2">Panel</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tighter">
        Buen servicio{usuario ? `, ${usuario.rolNombre.toLowerCase()}` : ''}.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Abre el salon para tomar pedidos y gestionar las fichas.
      </p>
      <div className="mt-6">
        <Link
          to="/mesas"
          className="btn-heat group inline-flex h-11 items-center gap-2.5 rounded-lg px-4 font-heading text-sm font-semibold uppercase tracking-wide"
        >
          <Grid2x2 className="size-4" />
          Ir a Pedidos
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  )
}
