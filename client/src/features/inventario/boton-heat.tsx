import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

// CTA de calor reutilizable (gradiente + "+" en pastilla). Compartido por las
// secciones de ingredientes y recetas.
export function BotonHeat({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-heat group inline-flex h-11 shrink-0 items-center gap-2.5 rounded-lg pl-2 pr-4 font-heading text-sm font-semibold uppercase tracking-wide disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="grid size-6 place-items-center rounded-md bg-primary-foreground/15 transition-transform group-hover:rotate-90">
        <Plus className="size-4" strokeWidth={2.75} />
      </span>
      {children}
    </button>
  )
}
