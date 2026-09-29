import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuthStore, useEsAdmin } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { errorApi } from '@/features/billing/caja-comun'

interface Recepcion {
  id: number
  cantidad: string
  concepto: string
  fechaSalida: string
  articuloDestino: { nombre: string; unidad: string }
}
export function RecepcionesPanaderia() {
  const queryClient = useQueryClient()
  const esAdmin = useEsAdmin()
  const panadero = useAuthStore((s) => s.usuario?.rolNombre === 'PANADERO')
  const { data, isError } = useQuery({
    queryKey: ['bakery', 'recepciones'],
    queryFn: () => api.get<Recepcion[]>('/bakery/recepciones'),
  })
  const recibir = useMutation({
    mutationFn: (id: number) => api.post(`/bakery/recepciones/${id}/recibir`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bakery'] })
      toast.success('Insumo recibido e incorporado al inventario')
    },
    onError: (e) => toast.error(errorApi(e)),
  })
  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron consultar los insumos pendientes del restaurante.
      </p>
    )
  if (!data?.length) return null
  return (
    <section className="space-y-3 rounded-lg bg-surface-low p-4">
      <h3 className="font-semibold">Insumos pendientes desde restaurante</h3>
      <p className="text-sm text-muted-foreground">
        Confirma solo cuando la mercancía llegue físicamente a panadería.
      </p>
      {data.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"
        >
          <div>
            <p>
              {r.cantidad} {r.articuloDestino.unidad} ·{' '}
              {r.articuloDestino.nombre}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.concepto} · salida{' '}
              {new Date(r.fechaSalida).toLocaleString('es-CO')}
            </p>
          </div>
          {(esAdmin || panadero) && (
            <Button
              size="sm"
              disabled={recibir.isPending}
              onClick={() => recibir.mutate(r.id)}
            >
              Confirmar recepción
            </Button>
          )}
        </div>
      ))}
    </section>
  )
}
