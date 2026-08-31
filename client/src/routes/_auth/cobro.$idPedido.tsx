import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import type { Factura } from '@/types/api'
import { ApiError } from '@/lib/api'
import { formatearPrecio } from '@/lib/formato'
import { useEsCaja } from '@/stores/auth.store'
import { pedidoQuery } from '@/features/pedidos/api'
import {
  configFacturacionQuery,
  facturasDePedidoQuery,
  turnoActualQuery,
} from '@/features/billing/api'
import { Badge } from '@/components/ui/badge'
import type { CuentaCobro } from '@/features/billing/cobro-tipos'
import { TarjetaCuenta } from '@/features/billing/cobro-cuentas'
import { PanelPago } from '@/features/billing/cobro-panel'

export const Route = createFileRoute('/_auth/cobro/$idPedido')({
  component: PaginaCobro,
})

function PaginaCobro() {
  const { idPedido: idParam } = Route.useParams()
  const idPedido = Number(idParam)
  const esCaja = useEsCaja()

  const { data: pedido, isPending, error } = useQuery(pedidoQuery(idPedido))
  const { data: facturas } = useQuery(facturasDePedidoQuery(idPedido))
  const { data: config } = useQuery(configFacturacionQuery)
  const { data: turno } = useQuery(turnoActualQuery)

  const cuentas = useMemo<CuentaCobro[]>(() => {
    if (!pedido) return []
    const detalles = (pedido.comandas ?? []).flatMap((c) => c.detalles ?? [])
    const facturaDe = new Map<number, Factura>()
    for (const f of facturas ?? []) {
      if (f.estado_factura !== 'ANULADA') facturaDe.set(f.id_subcuenta_factura, f)
    }
    const subcuentas = [...(pedido.subcuentas ?? [])].sort((a, b) => a.id_subcuenta - b.id_subcuenta)

    return subcuentas
      .map((sub, i): CuentaCobro => {
        const items = detalles.filter(
          (d) =>
            d.id_detalleComandaPadre_dc === null &&
            d.id_subcuenta_dc === sub.id_subcuenta &&
            d.estado_dc !== 'CANCELADO',
        )
        const subtotal = detalles
          .filter((d) => d.id_subcuenta_dc === sub.id_subcuenta && d.estado_dc !== 'CANCELADO')
          .reduce((acc, d) => acc + Number(d.precio_unitario_dc) * d.cantidad_producto_dc, 0)
        const hayPreparando = detalles.some(
          (d) => d.id_subcuenta_dc === sub.id_subcuenta && d.estado_dc === 'PREPARANDO',
        )
        return {
          id: sub.id_subcuenta,
          nombre: sub.nombre_subcuenta ?? `Cuenta ${i + 1}`,
          esPrincipal: i === 0,
          items,
          subtotal,
          hayPreparando,
          factura: facturaDe.get(sub.id_subcuenta),
        }
      })
      // Solo cuentas con algo que cobrar: items o una factura vigente.
      .filter((c) => c.items.length > 0 || c.factura !== undefined)
  }, [pedido, facturas])

  const [idSel, setIdSel] = useState<number | null>(null)
  const idActiva = idSel ?? cuentas[0]?.id ?? null
  const activa = cuentas.find((c) => c.id === idActiva)

  if (!esCaja) {
    return (
      <MensajeCentrado icono={Lock}>Solo cajeros y administradores pueden cobrar.</MensajeCentrado>
    )
  }
  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground md:p-10">Cargando cuenta…</p>
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

  const checkTotal = cuentas.reduce(
    (acc, c) => acc + (c.factura ? Number(c.factura.monto_total_factura) : c.subtotal),
    0,
  )
  const pagado = pedido.estado_pedido === 'PAGADO'

  return (
    <div className="flex min-h-svh flex-col xl:h-svh xl:flex-row xl:overflow-hidden">
      {/* Columna central: la cuenta y sus subcuentas */}
      <div className="scrollbar-fina min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
        <header>
          <div className="flex items-center justify-between gap-3">
            {/* Si la mesa ya quedo saldada (todas las cuentas pagadas), volver
                lleva directo a Mesas: no hay nada que hacer en el pedido. Si
                aun queda saldo, se vuelve al pedido para seguir gestionandolo. */}
            {pagado ? (
              <Link
                to="/mesas"
                className="micro-label inline-flex items-center gap-1 hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Mesas
              </Link>
            ) : (
              <Link
                to="/pedidos/$idPedido"
                params={{ idPedido: String(idPedido) }}
                className="micro-label inline-flex items-center gap-1 hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Pedido
              </Link>
            )}
            {pagado && <Badge className="bg-primary/15 text-primary">Pagado</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-heading text-3xl font-semibold tracking-tighter md:text-4xl">
              {pedido.tipo_pedido === 'DOMICILIO'
                ? `Domicilio · ${pedido.nombre_cliente_pedido ?? 'Cliente'}`
                : `Mesa ${pedido.mesa?.numero_mesa ?? pedido.mesa_pedido}`}
              <span className="ml-3 text-base font-normal text-muted-foreground">
                Pedido #{pedido.id_pedido}
              </span>
            </h1>
            <div className="text-right">
              <p className="micro-label">Total de la cuenta</p>
              <p className="font-heading text-3xl font-semibold tabular-nums tracking-tighter text-primary">
                {formatearPrecio(checkTotal)}
              </p>
            </div>
          </div>
        </header>

        {pagado && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-surface-high p-4">
            <CheckCircle2 className="size-5 shrink-0 text-primary" />
            <p className="text-sm">
              Pedido pagado por completo; la mesa quedo libre. Puedes anular una factura si hubo un error.
            </p>
          </div>
        )}

        {cuentas.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No hay items enviados para cobrar en este pedido.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {cuentas.map((cuenta) => (
              <li key={cuenta.id}>
                <TarjetaCuenta
                  cuenta={cuenta}
                  activa={cuenta.id === idActiva}
                  onSeleccionar={() => setIdSel(cuenta.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Panel de pago de la cuenta seleccionada */}
      <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface-low xl:h-svh xl:w-[26rem] xl:border-l xl:border-t-0">
        {activa ? (
          <PanelPago
            key={activa.id}
            cuenta={activa}
            porcentajeImpuestos={config ? Number(config.porcentaje_impuestos) : 0}
            propinaSugerida={config ? Number(config.porcentaje_servicio) : 0}
            hayTurno={turno != null}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
            Selecciona una cuenta para cobrar.
          </div>
        )}
      </aside>
    </div>
  )
}

function MensajeCentrado({ icono: Icono, children }: { icono: typeof Lock; children: ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center p-10 text-center">
      <div>
        <Icono className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}
