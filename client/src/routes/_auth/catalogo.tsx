import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEsAdmin } from '@/stores/auth.store'
import { SeccionProductos } from '@/features/catalogo/seccion-productos'
import { SeccionCombos } from '@/features/catalogo/seccion-combos'
import { SeccionCategorias } from '@/features/catalogo/seccion-categorias'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_auth/catalogo')({
  component: PaginaCatalogo,
})

type Pestana = 'productos' | 'combos' | 'categorias'

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'combos', etiqueta: 'Combos' },
  { id: 'categorias', etiqueta: 'Categorias' },
]

function PaginaCatalogo() {
  const esAdmin = useEsAdmin()
  const [pestana, setPestana] = useState<Pestana>('productos')
  const [busqueda, setBusqueda] = useState('')

  return (
    <div className="p-6 md:p-10">
      {/* Titulo + buscador. El buscador no aplica a Categorias (se listan en
          tabla completa), asi que solo aparece en Productos y Combos. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Catalogo</h1>
        {pestana !== 'categorias' ? (
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el catalogo…"
              className="h-11 border-transparent bg-surface-low pl-10"
            />
          </div>
        ) : null}
      </div>

      {/* Pestañas subrayadas, separadas del titulo */}
      <div className="mt-10 flex items-center gap-6 border-b border-border">
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

      {!esAdmin ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Solo lectura: los cambios del catalogo los hace el administrador.
        </p>
      ) : null}

      <div className="mt-6">
        {pestana === 'productos' ? (
          <SeccionProductos esAdmin={esAdmin} busqueda={busqueda} />
        ) : pestana === 'combos' ? (
          <SeccionCombos esAdmin={esAdmin} busqueda={busqueda} />
        ) : (
          <SeccionCategorias esAdmin={esAdmin} />
        )}
      </div>
    </div>
  )
}
