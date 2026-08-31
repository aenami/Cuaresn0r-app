import { Receipt } from 'lucide-react'
import type { DetalleComanda, Factura } from '@/types/api'
import { formatearPrecio } from '@/lib/formato'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CuentaCobro } from './cobro-tipos'

// Tarjeta de una cuenta en la lista central: nombre, estado, items y total.
export function TarjetaCuenta({
  cuenta,
  activa,
  onSeleccionar,
}: {
  cuenta: CuentaCobro
  activa: boolean
  onSeleccionar: () => void
}) {
  const factura = cuenta.factura
  const total = factura ? Number(factura.monto_total_factura) : cuenta.subtotal
  const pagado = factura
    ? (factura.pagos ?? []).reduce((acc, p) => acc + Number(p.monto_total_pago), 0)
    : 0
  const saldo = total - pagado

  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={cn(
        'w-full rounded-xl border-l-4 bg-surface-high p-4 text-left transition-[transform,box-shadow] duration-150 ease-out-quart hover:brightness-110',
        activa
          ? 'border-primary shadow-[0_10px_28px_-16px_rgb(255_145_87_/_0.6)]'
          : cuenta.esPrincipal
            ? 'border-primary/40'
            : 'border-tertiary/50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Receipt className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate font-heading text-base font-semibold tracking-tight">{cuenta.nombre}</h3>
          <EstadoCuenta factura={factura} saldo={saldo} />
        </div>
        <span className="shrink-0 font-heading text-base font-semibold tabular-nums text-primary">
          {formatearPrecio(total)}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {cuenta.items.map((item) => (
          <ItemLinea key={item.id_detalleComanda} item={item} />
        ))}
        {cuenta.items.length === 0 && (
          <li className="text-xs text-muted-foreground">Sin items (factura vigente).</li>
        )}
      </ul>
    </button>
  )
}

function EstadoCuenta({ factura, saldo }: { factura: Factura | undefined; saldo: number }) {
  if (!factura) {
    return <Badge className="bg-surface-lowest text-muted-foreground">Sin facturar</Badge>
  }
  if (factura.estado_factura === 'PAGADA' || saldo <= 0) {
    return <Badge className="bg-primary/15 text-primary">Pagada</Badge>
  }
  return <Badge className="bg-tertiary/15 text-tertiary">Saldo {formatearPrecio(saldo)}</Badge>
}

// Una linea de item (padre + sus adiciones con precio).
function ItemLinea({ item }: { item: DetalleComanda }) {
  const nombre = item.producto?.nombre_producto ?? item.combo?.nombre_combo ?? 'Item'
  const adiciones = (item.hijos ?? []).filter(
    (h) => h.estado_dc !== 'CANCELADO' && Number(h.precio_unitario_dc) > 0,
  )
  const total =
    Number(item.precio_unitario_dc) * item.cantidad_producto_dc +
    adiciones.reduce((acc, h) => acc + Number(h.precio_unitario_dc) * h.cantidad_producto_dc, 0)

  return (
    <li className="flex items-start justify-between gap-2 text-sm">
      <span className="min-w-0">
        <span className="tabular-nums text-muted-foreground">{item.cantidad_producto_dc}×</span> {nombre}
        {adiciones.length > 0 && (
          <span className="block text-xs text-muted-foreground">
            {adiciones.map((h) => `+ ${h.cantidad_producto_dc}× ${h.producto?.nombre_producto ?? 'extra'}`).join(', ')}
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{formatearPrecio(total)}</span>
    </li>
  )
}
