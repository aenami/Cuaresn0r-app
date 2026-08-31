import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

// Accion primaria "agregar": CTA de calor (gradiente), con el "+" en una
// pastilla. Compartido por las secciones de productos, combos y categorias.
export function BotonNuevo({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-heat group inline-flex h-10 items-center gap-2.5 rounded-lg pr-4 pl-2 font-heading text-sm font-semibold uppercase tracking-wide"
    >
      <span className="grid size-6 place-items-center rounded-md bg-primary-foreground/15 transition-transform group-hover:rotate-90">
        <Plus className="size-4" strokeWidth={2.75} />
      </span>
      {children}
    </button>
  )
}
