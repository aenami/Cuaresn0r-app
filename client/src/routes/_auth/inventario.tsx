import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useAreaTrabajo, useEsAdmin, useEsGlobal } from '@/stores/auth.store'
import { SeccionIngredientes } from '@/features/inventario/seccion-ingredientes'
import { SeccionRecetas } from '@/features/inventario/seccion-recetas'
import { SeccionProduccion } from '@/features/inventario/seccion-produccion'
import { SeccionConteoDiario } from '@/features/inventario/seccion-conteo-diario'
import { InventarioPanaderia } from '@/features/panaderia/inventario'
import { ConteoDiarioPanaderia } from '@/features/panaderia/conteo-diario'
import { ProductosInventarioPanaderia } from '@/features/panaderia/productos-inventario'
import { SalidasRestaurante } from '@/features/inventario/salidas-restaurante'
import { RecetasPanaderia } from '@/features/panaderia/recetas'
import { MetasProduccionPanaderia } from '@/features/panaderia/metas-produccion'
import { cn } from '@/lib/utils'
import { ResumenMonetarioPorFechas } from '@/features/inventario/resumen-valoracion-rango'

export const Route = createFileRoute('/_auth/inventario')({
  validateSearch: z.object({ area: z.enum(['RESTAURANTE', 'PANADERIA']).optional() }),
  component: PaginaInventario,
})

type Pestana = 'produccion' | 'productos' | 'conteo' | 'ingredientes' | 'salidas' | 'recetas'
type VistaConteo = 'registro' | 'analisis'
const VISTAS_CONTEO: { id: VistaConteo; etiqueta: string }[] = [
  { id: 'registro', etiqueta: 'Registro diario' },
  { id: 'analisis', etiqueta: 'Análisis por fechas' },
]

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: 'produccion', etiqueta: 'Produccion diaria' },
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'conteo', etiqueta: 'Conteo diario' },
  { id: 'ingredientes', etiqueta: 'Ingredientes' },
  { id: 'salidas', etiqueta: 'Salidas' },
  { id: 'recetas', etiqueta: 'Recetas' },
]

function PaginaInventario() {
  const esAdmin = useEsAdmin()
  const esGlobal = useEsGlobal()
  const area = useAreaTrabajo()
  const [pestana, setPestana] = useState<Pestana>('produccion')
  const pestanaVisible = area === 'PANADERIA'
    ? pestana === 'salidas' ? 'productos' : pestana
    : pestana === 'productos' ? 'produccion' : pestana
  const pestanas = area === 'PANADERIA'
    ? PESTANAS.filter((p) => p.id !== 'salidas')
    : PESTANAS.filter((p) => p.id !== 'productos')

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
        {area === 'PANADERIA' ? pestanaVisible === 'produccion' ? <MetasProduccionPanaderia esAdmin={esAdmin} esGlobal={esGlobal} />
          : pestanaVisible === 'recetas' ? <RecetasPanaderia esAdmin={esAdmin} />
          : pestanaVisible === 'conteo' ? <VistaInternaConteo key={area} area={area} esAdmin={esAdmin} esGlobal={esGlobal} />
          : pestanaVisible === 'productos' ? <ProductosInventarioPanaderia />
          : <InventarioPanaderia esAdmin={esAdmin && !esGlobal} vista="ingredientes" />
          : pestanaVisible === 'produccion' ? (
          <SeccionProduccion esAdmin={esAdmin} />
        ) : pestanaVisible === 'conteo' ? (
          <VistaInternaConteo key={area} area={area} esAdmin={esAdmin} esGlobal={esGlobal} />
        ) : pestanaVisible === 'ingredientes' ? (
          <SeccionIngredientes esAdmin={esAdmin} />
        ) : pestanaVisible === 'salidas' ? (
          <SalidasRestaurante puedeRegistrar={!esGlobal} />
        ) : (
          <SeccionRecetas esAdmin={esAdmin} />
        )}
      </div>
    </div>
  )
}

function VistaInternaConteo({ area, esAdmin, esGlobal }: {
  area: 'RESTAURANTE' | 'PANADERIA'
  esAdmin: boolean
  esGlobal: boolean
}) {
  const [vista, setVista] = useState<VistaConteo>('registro')

  return (
    <section aria-label="Conteo diario">
      {esAdmin ? (
        <div role="tablist" aria-label="Secciones del conteo diario" className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-low p-1">
          {VISTAS_CONTEO.map((opcion) => (
            <button
              key={opcion.id}
              id={`conteo-tab-${opcion.id}`}
              type="button"
              role="tab"
              aria-selected={vista === opcion.id}
              aria-controls={`conteo-panel-${opcion.id}`}
              tabIndex={vista === opcion.id ? 0 : -1}
              onClick={() => setVista(opcion.id)}
              onKeyDown={(evento) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return
                evento.preventDefault()
                const siguiente = evento.key === 'Home' ? 'registro'
                  : evento.key === 'End' ? 'analisis'
                    : vista === 'registro' ? 'analisis' : 'registro'
                setVista(siguiente)
                document.getElementById(`conteo-tab-${siguiente}`)?.focus()
              }}
              className={cn(
                'shrink-0 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                vista === opcion.id ? 'bg-surface-high text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      ) : null}

      <div id="conteo-panel-registro" role={esAdmin ? 'tabpanel' : undefined} aria-labelledby={esAdmin ? 'conteo-tab-registro' : undefined} hidden={vista !== 'registro'}>
        {vista === 'registro' ? area === 'PANADERIA'
          ? <ConteoDiarioPanaderia esAdmin={esAdmin} soloLectura={esGlobal} />
          : <SeccionConteoDiario esAdmin={esAdmin} /> : null}
      </div>
      {esAdmin ? (
        <div id="conteo-panel-analisis" role="tabpanel" aria-labelledby="conteo-tab-analisis" hidden={vista !== 'analisis'}>
          {vista === 'analisis' ? <ResumenMonetarioPorFechas /> : null}
        </div>
      ) : null}
    </section>
  )
}
