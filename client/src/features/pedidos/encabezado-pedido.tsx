import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightLeft, Bike, MapPin, Phone } from 'lucide-react'
import { mesasQuery, useTransferirMesa } from '@/features/pedidos/api'
import type { Pedido } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { errorATexto, TEXTO_ESTADO_PEDIDO } from './comun'

export function EncabezadoPedido({ pedido, editable }: { pedido: Pedido; editable: boolean }) {
  const esDomicilio = pedido.tipo_pedido === 'DOMICILIO'
  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <p className="micro-label">
          <Link to="/mesas" className="hover:text-foreground">← Mesas</Link>
        </p>
        <div className="flex items-center gap-2">
          {/* Un domicilio no tiene mesa: no aplica transferir. */}
          {editable && !esDomicilio ? <BotonTransferir pedido={pedido} /> : null}
          <Badge
            className={cn(
              pedido.estado_pedido === 'EN_PREPARACION' && 'bg-tertiary/15 text-tertiary',
              pedido.estado_pedido === 'ENTREGADO' && 'bg-primary/15 text-primary',
              pedido.estado_pedido === 'PAGADO' && 'bg-secondary text-secondary-foreground',
              pedido.estado_pedido === 'CANCELADO' && 'bg-destructive/15 text-destructive',
            )}
          >
            {TEXTO_ESTADO_PEDIDO[pedido.estado_pedido]}
          </Badge>
        </div>
      </div>
      <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tighter">
        {esDomicilio ? (
          <span className="inline-flex items-center gap-2">
            <Bike className="size-6 text-primary" />
            {pedido.nombre_cliente_pedido ?? 'Domicilio'}
          </span>
        ) : (
          <>Mesa {pedido.mesa?.numero_mesa ?? pedido.mesa_pedido}</>
        )}
        <span className="ml-3 text-base font-normal text-muted-foreground">
          {esDomicilio ? 'Domicilio' : (pedido.mesa?.zona?.nombre_zona ?? '')} · Pedido #{pedido.id_pedido}
        </span>
      </h1>
      {esDomicilio && (pedido.telefono_cliente_pedido || pedido.direccion_cliente_pedido) ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {pedido.telefono_cliente_pedido ? (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0" /> <span className="tabular-nums">{pedido.telefono_cliente_pedido}</span>
            </span>
          ) : null}
          {pedido.direccion_cliente_pedido ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" /> {pedido.direccion_cliente_pedido}
            </span>
          ) : null}
        </p>
      ) : null}
    </header>
  )
}

// Transfiere el pedido completo a otra mesa libre (reubicacion fisica). El
// destino se elige de la parrilla de mesas LIBRE; el backend libera la de origen.
function BotonTransferir({ pedido }: { pedido: Pedido }) {
  const [abierto, setAbierto] = useState(false)
  const { data: mesas } = useQuery(mesasQuery)
  const transferir = useTransferirMesa(pedido.id_pedido)

  const libres = (mesas ?? [])
    .filter((m) => m.estado_mesa === 'LIBRE')
    .sort((a, b) => a.numero_mesa - b.numero_mesa)

  function transferirA(idMesa: number, numero: number) {
    transferir
      .mutateAsync(idMesa)
      .then(() => {
        toast.success(`Pedido transferido a la mesa ${numero}`)
        setAbierto(false)
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAbierto(true)}>
        <ArrowRightLeft className="size-3.5" /> Transferir mesa
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Transferir mesa</DialogTitle>
            <DialogDescription>
              Mueve el pedido y todas sus cuentas de la mesa{' '}
              {pedido.mesa?.numero_mesa ?? pedido.mesa_pedido} a una mesa libre. La mesa actual queda libre.
            </DialogDescription>
          </DialogHeader>
          {libres.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No hay mesas libres para transferir.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {libres.map((mesa) => (
                <button
                  key={mesa.id_mesa}
                  type="button"
                  disabled={transferir.isPending}
                  onClick={() => transferirA(mesa.id_mesa, mesa.numero_mesa)}
                  className="flex flex-col items-center rounded-lg border-b-4 border-secondary bg-surface-high py-3 transition-transform duration-150 ease-out-quart hover:-translate-y-1 hover:border-primary/60 active:scale-[0.95] disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="font-heading text-xl font-semibold tabular-nums tracking-tighter">
                    {mesa.numero_mesa}
                  </span>
                  {mesa.zona ? <span className="micro-label mt-0.5">{mesa.zona.identificador_zona}</span> : null}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
