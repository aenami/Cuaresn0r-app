import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore, useEsAdmin, useEsCaja } from '@/stores/auth.store'
import { TrasladosRestaurante } from '@/features/panaderia/traslados-restaurante'

export const Route = createFileRoute('/_auth/traslados')({ component: PaginaTraslados })

function PaginaTraslados() {
  const esAdmin = useEsAdmin()
  const esCaja = useEsCaja()
  const area = useAuthStore((s) => s.usuario?.area)
  if (!esCaja || (!esAdmin && area !== 'RESTAURANTE'))
    return <p className="p-8 text-sm text-muted-foreground">No tienes acceso a los traslados de restaurante.</p>
  return <TrasladosRestaurante esAdmin={esAdmin} />
}
