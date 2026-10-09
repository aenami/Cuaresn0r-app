import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function BuscadorConteo({
  valor,
  onChange,
  encontrados,
  total,
}: {
  valor: string
  onChange: (valor: string) => void
  encontrados: number
  total: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Buscar producto o ingrediente en el conteo"
          placeholder="Buscar producto o ingrediente"
          value={valor}
          onChange={(evento) => onChange(evento.target.value)}
          className="pl-10 pr-10"
        />
        {valor ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Limpiar búsqueda del conteo"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {encontrados} de {total} elementos
      </p>
    </div>
  )
}
