import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Clock, Coins, Lock, Settings2, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEsAdmin, useEsCaja } from '@/stores/auth.store'
import { cn } from '@/lib/utils'
import { Directorio } from '@/features/nomina/directorio'
import { Asistencia } from '@/features/nomina/asistencia'
import { Configuracion } from '@/features/nomina/configuracion'
import { Propinas } from '@/features/nomina/propinas'

export const Route = createFileRoute('/_auth/nomina')({
  component: PaginaNomina,
})

type Seccion = 'directorio' | 'asistencia' | 'propinas' | 'configuracion'

function PaginaNomina() {
  const esCaja = useEsCaja()
  const esAdmin = useEsAdmin()
  const [seccion, setSeccion] = useState<Seccion>('directorio')

  if (!esCaja) {
    return (
      <div className="grid min-h-full place-items-center p-10 text-center">
        <div>
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Solo cajeros y administradores acceden a nomina.</p>
        </div>
      </div>
    )
  }

  const tabs: { id: Seccion; etiqueta: string; icono: LucideIcon }[] = [
    { id: 'directorio', etiqueta: 'Directorio', icono: Users },
    { id: 'asistencia', etiqueta: 'Asistencia', icono: Clock },
    ...(esAdmin
      ? [
          { id: 'propinas' as const, etiqueta: 'Propinas', icono: Coins },
          { id: 'configuracion' as const, etiqueta: 'Configuracion', icono: Settings2 },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="micro-label tracking-[0.22em]">Nomina_KitchenOps</p>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto scrollbar-fina rounded-lg bg-surface-lowest p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={seccion === t.id}
              onClick={() => setSeccion(t.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 ease-out-quart sm:px-3',
                seccion === t.id ? 'bg-surface-high text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* El icono se oculta en telefono para que las pestañas quepan sin desbordar. */}
              <t.icono className="hidden size-3.5 sm:block" /> {t.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {seccion === 'directorio' ? (
        <Directorio esAdmin={esAdmin} />
      ) : seccion === 'asistencia' ? (
        <Asistencia />
      ) : seccion === 'propinas' ? (
        <Propinas />
      ) : (
        <Configuracion />
      )}
    </div>
  )
}
