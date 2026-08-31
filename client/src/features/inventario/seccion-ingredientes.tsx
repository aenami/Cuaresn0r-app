import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Check, Search, SquarePen, TriangleAlert } from 'lucide-react'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'
import { ingredientesQuery } from '@/features/inventario/api'
import { IngredienteFormDialog } from '@/features/inventario/ingrediente-form-dialog'
import { MovimientoDialog } from '@/features/inventario/movimiento-dialog'
import type { Ingrediente } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { BotonHeat } from './boton-heat'

export function SeccionIngredientes({ esAdmin }: { esAdmin: boolean }) {
  const { data: ingredientes, isPending } = useQuery(ingredientesQuery)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'agotados'>('todos')
  const [formulario, setFormulario] = useState<{ abierto: boolean; ingrediente: Ingrediente | null }>({
    abierto: false,
    ingrediente: null,
  })
  const [movimiento, setMovimiento] = useState<Ingrediente | null>(null)

  if (isPending) return <p className="text-sm text-muted-foreground">Cargando ingredientes…</p>

  const lista = ingredientes ?? []
  const agotados = lista.filter((i) => Number(i.stock_ingrediente) <= 0).length

  const termino = busqueda.trim().toLowerCase()
  const visibles = lista.filter((i) => {
    const porTexto = termino === '' || i.nombre_ingrediente.toLowerCase().includes(termino)
    const porFiltro = filtro === 'todos' || Number(i.stock_ingrediente) <= 0
    return porTexto && porFiltro
  })

  return (
    <div>
      {/* Filtros + buscador + accion */}
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PastillaFiltro
            activo={filtro === 'todos'}
            onClick={() => setFiltro('todos')}
            etiqueta="Todos"
            conteo={lista.length}
          />
          <PastillaFiltro
            activo={filtro === 'agotados'}
            onClick={() => setFiltro('agotados')}
            etiqueta="Agotados"
            conteo={agotados}
            alerta
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ingrediente…"
              className="h-11 border-transparent bg-surface-low pl-10"
            />
          </div>
          {esAdmin ? (
            <BotonHeat onClick={() => setFormulario({ abierto: true, ingrediente: null })}>
              Nuevo
            </BotonHeat>
          ) : null}
        </div>
      </div>

      {/* Encabezado de columnas (desktop) */}
      <div className="mb-2 hidden items-center gap-4 px-4 sm:flex">
        <span className="size-9 shrink-0" aria-hidden />
        <span className="micro-label flex-1">Ingrediente</span>
        <span className="micro-label w-32 text-right">Stock</span>
        <span className="micro-label w-28 text-right">Costo unitario</span>
        <span className="micro-label w-28 text-right">Estado</span>
        {esAdmin ? <span className="w-44" aria-hidden /> : null}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lista.length === 0
            ? 'No hay ingredientes. Crea el primero para armar las recetas.'
            : filtro === 'agotados'
              ? 'No hay ingredientes agotados.'
              : 'Ningun ingrediente coincide con la busqueda.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((ingrediente) => (
            <FilaIngrediente
              key={ingrediente.id_ingrediente}
              ingrediente={ingrediente}
              esAdmin={esAdmin}
              onEditar={() => setFormulario({ abierto: true, ingrediente })}
              onMovimiento={() => setMovimiento(ingrediente)}
            />
          ))}
        </ul>
      )}

      <IngredienteFormDialog
        ingrediente={formulario.ingrediente}
        abierto={formulario.abierto}
        onCerrar={() => setFormulario((f) => ({ ...f, abierto: false }))}
      />
      <MovimientoDialog ingrediente={movimiento} onCerrar={() => setMovimiento(null)} />
    </div>
  )
}

function FilaIngrediente({
  ingrediente,
  esAdmin,
  onEditar,
  onMovimiento,
}: {
  ingrediente: Ingrediente
  esAdmin: boolean
  onEditar: () => void
  onMovimiento: () => void
}) {
  const stock = Number(ingrediente.stock_ingrediente)
  const agotado = stock <= 0

  return (
    <li
      className={cn(
        'rounded-lg border-l-2 bg-surface-low p-4 transition-colors',
        agotado ? 'border-destructive' : 'border-transparent hover:bg-surface',
      )}
    >
      <div className="flex items-center gap-4">
        {/* Indicador de estado */}
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-md',
            agotado ? 'bg-destructive/15 text-destructive' : 'bg-surface-high text-muted-foreground',
          )}
        >
          {agotado ? <TriangleAlert className="size-4" /> : <Check className="size-4" strokeWidth={2.5} />}
        </span>

        {/* Nombre (+ meta compacta en movil) */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-semibold">{ingrediente.nombre_ingrediente}</p>
          <p className="mt-0.5 text-sm text-muted-foreground sm:hidden">
            <span className="tabular-nums text-foreground">
              {formatearCantidad(ingrediente.stock_ingrediente)} {ingrediente.unidades_ingrediente}
            </span>
            {' · '}
            {formatearPrecio(ingrediente.precio_ingrediente)}
          </p>
        </div>

        {/* Stock (desktop) */}
        <div className="hidden w-32 items-baseline justify-end gap-2 sm:flex">
          <span className={cn('font-heading text-lg tabular-nums', agotado && 'text-destructive')}>
            {formatearCantidad(ingrediente.stock_ingrediente)}
          </span>
          <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {ingrediente.unidades_ingrediente}
          </span>
        </div>

        {/* Costo (desktop) */}
        <div className="hidden w-28 text-right font-medium tabular-nums text-muted-foreground sm:block">
          {formatearPrecio(ingrediente.precio_ingrediente)}
        </div>

        {/* Estado */}
        <div className="flex justify-end sm:w-28">
          <BadgeEstadoStock agotado={agotado} />
        </div>

        {/* Acciones admin (desktop) */}
        {esAdmin ? (
          <div className="hidden w-44 justify-end gap-2 sm:flex">
            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={onEditar}>
              <SquarePen className="size-3.5" />
              Editar
            </Button>
            <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={onMovimiento}>
              <ArrowLeftRight className="size-3.5" />
              Movimiento
            </Button>
          </div>
        ) : null}
      </div>

      {/* Acciones admin (movil) */}
      {esAdmin ? (
        <div className="mt-3 flex gap-2 sm:hidden">
          <Button size="sm" variant="ghost" className="h-8 flex-1 text-xs" onClick={onEditar}>
            <SquarePen className="size-3.5" />
            Editar
          </Button>
          <Button size="sm" variant="secondary" className="h-8 flex-1 text-xs" onClick={onMovimiento}>
            <ArrowLeftRight className="size-3.5" />
            Movimiento
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function BadgeEstadoStock({ agotado }: { agotado: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
        agotado ? 'bg-destructive/15 text-destructive' : 'bg-surface-high text-muted-foreground',
      )}
    >
      {agotado ? 'Agotado' : 'En stock'}
    </span>
  )
}

function PastillaFiltro({
  activo,
  onClick,
  etiqueta,
  conteo,
  alerta,
}: {
  activo: boolean
  onClick: () => void
  etiqueta: string
  conteo: number
  alerta?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
        activo
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
      )}
    >
      {alerta ? (
        <span className={cn('size-1.5 rounded-full', activo ? 'bg-primary' : 'bg-destructive')} />
      ) : null}
      {etiqueta}
      <span className="tabular-nums opacity-70">{conteo}</span>
    </button>
  )
}
