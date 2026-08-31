import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatearPrecio } from '@/lib/formato'
import { combosQuery, useCambiarActivoCombo } from '@/features/catalogo/api'
import { ComboFormDialog } from '@/features/catalogo/combo-form-dialog'
import type { Combo } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { errorATexto } from './comun'
import { BotonNuevo } from './boton-nuevo'

export function SeccionCombos({ esAdmin, busqueda }: { esAdmin: boolean; busqueda: string }) {
  const { data: combos, isPending } = useQuery(combosQuery)
  const cambiarActivo = useCambiarActivoCombo()
  const [dialogo, setDialogo] = useState<{ abierto: boolean; combo: Combo | null }>({
    abierto: false,
    combo: null,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Cargando combos…</p>

  const termino = busqueda.trim().toLowerCase()
  const visibles = (combos ?? []).filter(
    (c) => termino === '' || c.nombre_combo.toLowerCase().includes(termino),
  )

  return (
    <div>
      {esAdmin ? (
        <div className="mb-6 flex justify-end">
          <BotonNuevo onClick={() => setDialogo({ abierto: true, combo: null })}>
            Nuevo combo
          </BotonNuevo>
        </div>
      ) : null}

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {combos?.length === 0 ? 'No hay combos todavia.' : 'Ningun combo coincide con el filtro.'}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((combo) => (
            <li
              key={combo.id_combo}
              className={cn(
                'rounded-xl border-l-4 bg-surface-high p-4',
                combo.combo_activo ? 'border-primary' : 'border-muted-foreground/30',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-heading text-base font-bold uppercase leading-tight tracking-tight">
                  {combo.nombre_combo}
                </h3>
                <span className="shrink-0 font-heading tabular-nums text-primary">
                  {formatearPrecio(combo.precio_combo)}
                </span>
              </div>
              {!combo.combo_activo ? (
                <Badge variant="secondary" className="mt-2">
                  Inactivo
                </Badge>
              ) : null}
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {combo.detallesCombo?.map((d) => (
                  <li key={d.id_detalleCombo}>
                    {Number(d.cantidad_detalleCombo)} ×{' '}
                    {d.producto?.nombre_producto ?? `Producto ${d.id_producto_detalleCombo}`}
                  </li>
                ))}
              </ul>
              {esAdmin ? (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setDialogo({ abierto: true, combo })}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 text-xs text-muted-foreground"
                    disabled={cambiarActivo.isPending}
                    onClick={() =>
                      cambiarActivo
                        .mutateAsync({ id: combo.id_combo, activar: !combo.combo_activo })
                        .then(() =>
                          toast.success(combo.combo_activo ? 'Combo desactivado' : 'Combo activado'),
                        )
                        .catch((e: unknown) => toast.error(errorATexto(e)))
                    }
                  >
                    {combo.combo_activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ComboFormDialog
        combo={dialogo.combo}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  )
}
