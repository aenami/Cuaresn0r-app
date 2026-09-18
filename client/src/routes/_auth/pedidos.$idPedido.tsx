import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UsersRound } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { pedidoQuery } from '@/features/pedidos/api'
import { useCarritoStore } from '@/features/pedidos/carrito.store'
import { PersonalizarDialog, type SeleccionMenu } from '@/features/pedidos/personalizar-dialog'
import { EncabezadoPedido } from '@/features/pedidos/encabezado-pedido'
import { SeccionMenu } from '@/features/pedidos/seccion-menu'
import { PanelComanda } from '@/features/pedidos/panel-comanda'
import { TEXTO_ESTADO_PEDIDO } from '@/features/pedidos/comun'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Subcuenta } from '@/types/api'

export const Route = createFileRoute('/_auth/pedidos/$idPedido')({
  component: PaginaPedido,
})

function PaginaPedido() {
  const { idPedido: idParam } = Route.useParams()
  const idPedido = Number(idParam)
  const { data: pedido, isPending, error } = useQuery(pedidoQuery(idPedido))
  const [seleccion, setSeleccion] = useState<SeleccionMenu | null>(null)
  const [cuentaElegida, setCuentaElegida] = useState<{
    idPedido: number
    idCuenta: number
  } | null>(null)
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
          Volver a pedidos
        </Link>
      </div>
    )
  }

  const pedidoAbierto =
    pedido.estado_pedido !== 'CERRADO' && pedido.estado_pedido !== 'CANCELADO' && pedido.fecha_cierre_pedido === null
  const cuentas = pedido.subcuentas ?? []
  const idCuentaActiva =
    pedido.modalidad_cuenta_pedido === 'POR_CUENTA'
      ? cuentaElegida?.idPedido === idPedido && cuentas.some((cuenta) => cuenta.id_subcuenta === cuentaElegida.idCuenta)
        ? cuentaElegida.idCuenta
        : (cuentas[0]?.id_subcuenta ?? null)
      : null

  return (
    <div className="flex min-h-svh flex-col lg:h-svh lg:flex-row lg:overflow-hidden">
      {/* Menu */}
      <div className="scrollbar-fina min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
        <EncabezadoPedido pedido={pedido} editable={pedidoAbierto} />
        {pedidoAbierto && pedido.modalidad_cuenta_pedido === 'POR_CUENTA' && idCuentaActiva ? (
          <SelectorCuentaActiva
            cuentas={cuentas}
            idCuenta={idCuentaActiva}
            onCambiar={(idCuenta) => setCuentaElegida({ idPedido, idCuenta })}
          />
        ) : null}
        {pedidoAbierto ? (
          <SeccionMenu key={idPedido} onSeleccionar={setSeleccion} />
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
          agregarAlCarrito(idPedido, {
            ...item,
            ...(idCuentaActiva ? { idSubcuenta: idCuentaActiva } : {}),
          })
          toast.success(`${item.nombre} agregado a la comanda`)
        }}
      />
    </div>
  )
}

function SelectorCuentaActiva({
  cuentas,
  idCuenta,
  onCambiar,
}: {
  cuentas: Subcuenta[]
  idCuenta: number
  onCambiar: (idCuenta: number) => void
}) {
  const cuenta = cuentas.find((item) => item.id_subcuenta === idCuenta)
  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-primary/[0.06] p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <UsersRound className="size-4" />
        </span>
        <div>
          <p className="micro-label text-primary">Tomando para</p>
          <p className="text-sm text-muted-foreground">
            Los productos nuevos quedarán en la cuenta de {cuenta?.nombre_subcuenta ?? 'este cliente'}.
          </p>
        </div>
      </div>
      <Select value={String(idCuenta)} onValueChange={(valor) => onCambiar(Number(valor))}>
        <SelectTrigger className="w-full bg-surface-high sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cuentas.map((item) => (
            <SelectItem key={item.id_subcuenta} value={String(item.id_subcuenta)}>
              {item.nombre_subcuenta ?? `Cuenta ${item.id_subcuenta}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  )
}
