import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { pedidoQuery } from '@/features/pedidos/api'
import { useCarritoStore } from '@/features/pedidos/carrito.store'
import { PersonalizarDialog, type SeleccionMenu } from '@/features/pedidos/personalizar-dialog'
import { EncabezadoPedido } from '@/features/pedidos/encabezado-pedido'
import { SeccionMenu } from '@/features/pedidos/seccion-menu'
import { PanelComanda } from '@/features/pedidos/panel-comanda'
import { TEXTO_ESTADO_PEDIDO } from '@/features/pedidos/comun'

export const Route = createFileRoute('/_auth/pedidos/$idPedido')({
  component: PaginaPedido,
})

function PaginaPedido() {
  const { idPedido: idParam } = Route.useParams()
  const idPedido = Number(idParam)
  const { data: pedido, isPending, error } = useQuery(pedidoQuery(idPedido))
  const [seleccion, setSeleccion] = useState<SeleccionMenu | null>(null)
  const agregarAlCarrito = useCarritoStore((s) => s.agregar)

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground md:p-10">Cargando pedido…</p>
  }
  if (error || !pedido) {
    return (
      <div className="p-6 md:p-10">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'No se pudo cargar el pedido'}
        </p>
        <Link to="/mesas" className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Volver a mesas
        </Link>
      </div>
    )
  }

  const pedidoAbierto = pedido.estado_pedido === 'EN_PREPARACION' || pedido.estado_pedido === 'ENTREGADO'

  return (
    <div className="flex min-h-svh flex-col lg:h-svh lg:flex-row lg:overflow-hidden">
      {/* Menu */}
      <div className="scrollbar-fina min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
        <EncabezadoPedido pedido={pedido} editable={pedidoAbierto} />
        {pedidoAbierto ? (
          <SeccionMenu onSeleccionar={setSeleccion} />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Este pedido esta {TEXTO_ESTADO_PEDIDO[pedido.estado_pedido].toLowerCase()}; ya no admite cambios.
          </p>
        )}
      </div>

      {/* Panel de comanda */}
      <PanelComanda pedido={pedido} editable={pedidoAbierto} />

      <PersonalizarDialog
        seleccion={seleccion}
        onCerrar={() => setSeleccion(null)}
        onAgregar={(item) => {
          agregarAlCarrito(idPedido, item)
          toast.success(`${item.nombre} agregado a la comanda`)
        }}
      />
    </div>
  )
}
