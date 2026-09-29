import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useAreaTrabajo, useEsAdmin, useEsGlobal } from '@/stores/auth.store'
import { SeccionIngredientes } from '@/features/inventario/seccion-ingredientes'
import { SeccionRecetas } from '@/features/inventario/seccion-recetas'
import { SeccionProduccion } from '@/features/inventario/seccion-produccion'
import { SeccionConteoDiario } from '@/features/inventario/seccion-conteo-diario'
import { InventarioPanaderia } from '@/features/panaderia/inventario'
import { RecetasPanaderia } from '@/features/panaderia/recetas'
import { cn } from '@/lib/utils'
import { ResumenMonetarioPorFechas } from '@/features/inventario/resumen-valoracion-rango'

export const Route = createFileRoute('/_auth/inventario')({
  validateSearch: z.object({ area: z.enum(['RESTAURANTE', 'PANADERIA']).optional() }),
  component: PaginaInventario,
})

type Pestana = 'produccion' | 'conteo' | 'ingredientes' | 'recetas'

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'produccion', etiqueta: 'Produccion diaria' },
  { id: 'conteo', etiqueta: 'Conteo diario' },
  { id: 'ingredientes', etiqueta: 'Ingredientes' },
  { id: 'recetas', etiqueta: 'Recetas' },
]

function PaginaInventario() {
  const esAdmin = useEsAdmin()
  const esGlobal = useEsGlobal()
  const area = useAreaTrabajo()
  const [pestana, setPestana] = useState<Pestana>('produccion')
  const pestanaVisible = area === 'PANADERIA' && pestana === 'produccion' ? 'conteo' : pestana
  const pestanas = area === 'PANADERIA' ? PESTANAS.filter((p) => p.id !== 'produccion') : PESTANAS

  return (
    <div className="p-6 md:p-10">
      <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Inventario</h1>
      <p className="mt-3 text-sm font-semibold text-primary">{area === 'PANADERIA' ? 'Panadería' : 'Restaurante'}</p>
      {!esAdmin ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {area === 'PANADERIA' ? 'Puedes registrar entradas y realizar el conteo físico de cierre.' : 'Puedes confirmar las metas de producción y realizar el conteo físico de cierre.'}
        </p>
      ) : null}

      {/* Pestañas subrayadas */}
      <div className="mt-8 flex items-center gap-6 overflow-x-auto border-b border-border">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wide transition-colors',
              pestanaVisible === p.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {area === 'PANADERIA' ? pestanaVisible === 'recetas' ? <RecetasPanaderia esAdmin={esAdmin} />
          : <InventarioPanaderia esAdmin={esAdmin && !esGlobal} vista={pestanaVisible === 'ingredientes' ? 'ingredientes' : 'conteo'} />
          : pestanaVisible === 'produccion' ? (
          <SeccionProduccion esAdmin={esAdmin} />
        ) : pestanaVisible === 'conteo' ? (
          <SeccionConteoDiario esAdmin={esAdmin} />
        ) : pestanaVisible === 'ingredientes' ? (
          <SeccionIngredientes esAdmin={esAdmin} />
        ) : (
          <SeccionRecetas esAdmin={esAdmin} />
        )}
      </div>
      {pestanaVisible === 'conteo' && esAdmin && <ResumenMonetarioPorFechas />}
    </div>
  )
}
