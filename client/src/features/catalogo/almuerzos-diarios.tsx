import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorApi } from '@/features/billing/caja-comun'
import { menuDiarioQuery, productosQuery, type OpcionMenu } from './api'
import { recetasQuery } from '@/features/inventario/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatearPrecio } from '@/lib/formato'

export function AlmuerzosDiarios() {
  const [fecha, setFecha] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
      new Date(),
    ),
  )
  const { data: productos } = useQuery(productosQuery)
  const { data: recetas } = useQuery(recetasQuery)
  const { data: opciones, isPending, error } = useQuery(menuDiarioQuery(fecha))
  const [id, setId] = useState<number | null>(null)
  const [lista, setLista] = useState<
    { grupo: OpcionMenu['grupo']; componenteId: number }[]
  >([])
  const qc = useQueryClient()
  const guardar = useMutation({
    mutationFn: () =>
      api.post(`/catalog/menu-diario/${id}`, { fecha, opciones: lista }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['catalogo', 'menu-diario'] })
      setId(null)
      toast.success('Opciones del día guardadas')
    },
    onError: (e) => toast.error(errorApi(e)),
  })
  const producto = productos?.find((p) => p.id_producto === id)
  const componentes = (productos ?? []).filter(
    (p) =>
      p.habilitado_producto &&
      !p.tipoMenu &&
      !p.articuloCompartidoId &&
      recetas?.some(
        (r) => r.id_producto_receta === p.id_producto && r.receta_activa,
      ),
  )
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            Almuerzos del día
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Crea Ejecutivo o Bandeja en Productos, su receta base en Inventario
            y aquí las opciones disponibles. Cada opción utiliza su propia
            receta; no cambia el precio del plato.
          </p>
        </div>
        <label className="text-sm">
          Fecha
          <Input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
          />
        </label>
      </div>
      {isPending ? (
        <p>Cargando opciones…</p>
      ) : error ? (
        <p role="alert" className="text-destructive">
          No se pudieron cargar las opciones.
        </p>
      ) : (
        (productos ?? [])
          .filter((p) => p.tipoMenu && p.habilitado_producto)
          .map((p) => (
            <div
              key={p.id_producto}
              className="flex flex-wrap justify-between gap-3 border-b border-border py-4"
            >
              <div>
                <h3 className="font-semibold">
                  {p.nombre_producto} · {formatearPrecio(p.precio_producto)}
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {(['CALDO', 'PRINCIPIO', 'PROTEINA'] as const)
                    .filter((g) => p.tipoMenu !== 'BANDEJA' || g !== 'CALDO')
                    .map((g) => (
                      <li key={g}>
                        {g === 'PROTEINA'
                          ? 'Proteína'
                          : g === 'CALDO'
                            ? 'Caldo'
                            : 'Principio'}
                        :{' '}
                        {(opciones ?? [])
                          .filter(
                            (o) =>
                              o.productoId === p.id_producto && o.grupo === g,
                          )
                          .map((o) => o.componente.nombre_producto)
                          .join(', ') || 'Sin configurar'}
                      </li>
                    ))}
                </ul>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setId(p.id_producto)
                  setLista(
                    (opciones ?? [])
                      .filter((o) => o.productoId === p.id_producto)
                      .map(({ grupo, componenteId }) => ({
                        grupo,
                        componenteId,
                      })),
                  )
                }}
              >
                Configurar opciones
              </Button>
            </div>
          ))
      )}
      {!isPending && !error && !productos?.some((p) => p.tipoMenu) ? (
        <p className="py-6 text-muted-foreground">
          Primero crea un producto de tipo Ejecutivo o Bandeja.
        </p>
      ) : null}
      <Dialog
        open={id !== null}
        onOpenChange={(v) => !v && !guardar.isPending && setId(null)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {producto?.nombre_producto} · {fecha}
            </DialogTitle>
            <DialogDescription>
              Marca las alternativas disponibles en cada grupo. Bandeja no
              incluye caldo.
            </DialogDescription>
          </DialogHeader>
          {(['CALDO', 'PRINCIPIO', 'PROTEINA'] as const)
            .filter((g) => producto?.tipoMenu !== 'BANDEJA' || g !== 'CALDO')
            .map((g) => (
              <fieldset key={g} className="space-y-2">
                <legend className="mb-2 font-semibold">
                  {g === 'PROTEINA'
                    ? 'Proteína'
                    : g === 'CALDO'
                      ? 'Caldo'
                      : 'Principio'}
                </legend>
                {componentes.map((p) => (
                  <label
                    key={p.id_producto}
                    className="flex items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      disabled={guardar.isPending}
                      checked={lista.some(
                        (o) =>
                          o.grupo === g && o.componenteId === p.id_producto,
                      )}
                      onChange={(e) =>
                        setLista((l) =>
                          e.target.checked
                            ? [...l, { grupo: g, componenteId: p.id_producto }]
                            : l.filter(
                                (o) =>
                                  o.grupo !== g ||
                                  o.componenteId !== p.id_producto,
                              ),
                        )
                      }
                    />
                    {p.nombre_producto}
                  </label>
                ))}
              </fieldset>
            ))}
          {!componentes.length ? (
            <p className="text-sm text-tertiary">
              Crea los componentes y sus recetas activas en Inventario para
              seleccionarlos.
            </p>
          ) : null}
          <Button disabled={guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar opciones'}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
