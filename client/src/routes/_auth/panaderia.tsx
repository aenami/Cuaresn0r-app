import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRight, Croissant, Lock } from 'lucide-react'
import { useAuthStore, useEsAdmin, useEsCaja } from '@/stores/auth.store'
import { cn } from '@/lib/utils'
import { turnoPanaderiaQuery } from '@/features/panaderia/api'
import { VentaPanaderia } from '@/features/panaderia/venta'
import { InventarioPanaderia } from '@/features/panaderia/inventario'
import { CajaPanaderia } from '@/features/panaderia/caja'
import { TrasladosPanaderia } from '@/features/panaderia/traslados'

export const Route = createFileRoute('/_auth/panaderia')({
  component: PaginaPanaderia,
})

type Vista = 'venta' | 'inventario' | 'caja' | 'traslados'
const vistas: { id: Vista; texto: string }[] = [
  { id: 'venta', texto: 'Venta' },
  { id: 'inventario', texto: 'Inventario y conteo' },
  { id: 'caja', texto: 'Caja y cuadre' },
  { id: 'traslados', texto: 'Traslados' },
]

function PaginaPanaderia() {
  const esAdmin = useEsAdmin()
  const esCaja = useEsCaja()
  const area = useAuthStore((s) => s.usuario?.area)
  const [vista, setVista] = useState<Vista>('venta')
  const acceso = esCaja && (esAdmin || area === 'PANADERIA')
  const { data: turno, isPending: turnoCargando } = useQuery({ ...turnoPanaderiaQuery, enabled: acceso })

  if (!acceso) return (
    <div className="grid min-h-full place-items-center p-10 text-center">
      <div><Lock className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Solo cajeros y administradores acceden a panaderia.</p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Croissant className="size-7 text-primary" aria-hidden="true" />
            <h1 className="font-heading text-3xl font-semibold uppercase tracking-tight md:text-4xl">Panaderia</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Venta de mostrador, hornadas, bebidas y cierre independiente.
          </p>
        </div>
        {esAdmin && <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Vista restaurante <ArrowUpRight className="size-4" />
        </Link>}
      </header>

      <nav aria-label="Secciones de panaderia" className="flex gap-1 overflow-x-auto rounded-lg bg-surface-lowest p-1">
        {vistas.map((item) => (
          <button key={item.id} type="button" aria-current={vista === item.id ? 'page' : undefined}
            onClick={() => setVista(item.id)}
            className={cn('shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-colors',
              vista === item.id ? 'bg-surface-high text-primary' : 'text-muted-foreground hover:bg-surface-high/60 hover:text-foreground')}>
            {item.texto}
          </button>
        ))}
      </nav>
      <p className="text-right text-xs text-muted-foreground sm:hidden">Desliza las pestañas para ver más →</p>

      {vista === 'venta' ? <VentaPanaderia turno={turno ?? null} onIrCaja={() => setVista('caja')} />
        : vista === 'inventario' ? <InventarioPanaderia esAdmin={esAdmin} />
          : vista === 'caja' ? <CajaPanaderia turno={turno ?? null} cargando={turnoCargando} esAdmin={esAdmin} onIrInventario={() => setVista('inventario')} />
            : <TrasladosPanaderia esAdmin={esAdmin} />}
    </div>
  )
}
