import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useEsAdmin } from '@/stores/auth.store'
import { SeccionIngredientes } from '@/features/inventario/seccion-ingredientes'
import { SeccionRecetas } from '@/features/inventario/seccion-recetas'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_auth/inventario')({
  component: PaginaInventario,
})

type Pestana = 'ingredientes' | 'recetas'

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'ingredientes', etiqueta: 'Ingredientes' },
  { id: 'recetas', etiqueta: 'Recetas' },
]

function PaginaInventario() {
  const esAdmin = useEsAdmin()
  const [pestana, setPestana] = useState<Pestana>('ingredientes')

  return (
    <div className="p-6 md:p-10">
      <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Inventario</h1>
      {!esAdmin ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Solo lectura: los cambios de inventario los hace el administrador.
        </p>
      ) : null}

      {/* Pestañas subrayadas */}
      <div className="mt-8 flex items-center gap-6 border-b border-border">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wide transition-colors',
              pestana === p.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {pestana === 'ingredientes' ? (
          <SeccionIngredientes esAdmin={esAdmin} />
        ) : (
          <SeccionRecetas esAdmin={esAdmin} />
        )}
      </div>
    </div>
  )
}
