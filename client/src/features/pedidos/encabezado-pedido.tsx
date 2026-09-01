import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Bike, Hash, MapPin, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { fichasQuery, useAsignarFicha } from '@/features/pedidos/api'
import { useEsCaja } from '@/stores/auth.store'
import type { Pedido } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { errorATexto, TEXTO_ESTADO_PEDIDO } from './comun'

export function EncabezadoPedido({ pedido, editable }: { pedido: Pedido; editable: boolean }) {
  const esDomicilio = pedido.tipo_pedido === 'DOMICILIO'
  const esCaja = useEsCaja()
  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <p className="micro-label"><Link to="/mesas" className="hover:text-foreground">← Pedidos</Link></p>
        <div className="flex items-center gap-2">
          {editable && esCaja && !esDomicilio ? <BotonFicha pedido={pedido} /> : null}
          <Badge
            className={cn(
              pedido.estado_pedido === 'ABIERTO' && 'bg-surface-high text-muted-foreground',
              pedido.estado_pedido === 'EN_PREPARACION' && 'bg-tertiary/15 text-tertiary',
              pedido.estado_pedido === 'ENTREGADO' && 'bg-destructive/15 text-destructive',
              pedido.estado_pedido === 'CERRADO' && 'bg-secondary text-secondary-foreground',
              pedido.estado_pedido === 'CANCELADO' && 'bg-destructive/15 text-destructive',
            )}
          >
            {TEXTO_ESTADO_PEDIDO[pedido.estado_pedido]}
          </Badge>
        </div>
      </div>
      <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tighter">
        {esDomicilio ? (
          <span className="inline-flex items-center gap-2"><Bike className="size-6 text-primary" />{pedido.nombre_cliente_pedido ?? 'Domicilio'}</span>
        ) : (
          <span className="inline-flex items-center gap-2"><Hash className="size-6 text-primary" />{pedido.ficha ? `Ficha ${pedido.ficha.numero_ficha}` : 'Pedido sin ficha'}</span>
        )}
        <span className="ml-3 text-base font-normal text-muted-foreground">Pedido #{pedido.id_pedido}</span>
      </h1>
      {esDomicilio && (pedido.telefono_cliente_pedido || pedido.direccion_cliente_pedido) ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {pedido.telefono_cliente_pedido ? <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{pedido.telefono_cliente_pedido}</span> : null}
          {pedido.direccion_cliente_pedido ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{pedido.direccion_cliente_pedido}</span> : null}
        </p>
      ) : null}
    </header>
  )
}

function BotonFicha({ pedido }: { pedido: Pedido }) {
  const [abierto, setAbierto] = useState(false)
  const { data: fichas } = useQuery(fichasQuery)
  const asignar = useAsignarFicha(pedido.id_pedido)
  const disponibles = (fichas ?? []).filter((ficha) => ficha.disponible || ficha.id_ficha === pedido.id_ficha_pedido)

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setAbierto(true)}>
        <Hash className="size-3.5" /> {pedido.ficha ? `Ficha ${pedido.ficha.numero_ficha}` : 'Asignar ficha'}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Asignar ficha al pedido</DialogTitle>
            <DialogDescription>Solo aparecen fichas activas sin otro pedido pendiente de entrega o pago.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {disponibles.map((ficha) => (
              <button
                key={ficha.id_ficha}
                type="button"
                disabled={asignar.isPending}
                onClick={() => asignar.mutateAsync(ficha.id_ficha).then(() => { toast.success(`Ficha ${ficha.numero_ficha} asignada`); setAbierto(false) }).catch((e: unknown) => toast.error(errorATexto(e)))}
                className={cn(
                  'rounded-lg border-b-4 bg-surface-high py-4 font-heading text-xl font-semibold transition-transform hover:-translate-y-1',
                  ficha.id_ficha === pedido.id_ficha_pedido ? 'border-primary text-primary' : 'border-secondary',
                )}
              >
                {ficha.numero_ficha}
              </button>
            ))}
          </div>
          {disponibles.length === 0 ? <p className="text-sm text-muted-foreground">No hay fichas disponibles.</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
