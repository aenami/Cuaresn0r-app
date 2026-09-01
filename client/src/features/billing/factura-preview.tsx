import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Printer, ReceiptText } from 'lucide-react'
import type { CuentaPagada, MetodoPago } from '@/types/api'
import { ApiError } from '@/lib/api'
import { formatearPrecio } from '@/lib/formato'
import { negocioConfigQuery, useImprimirFactura } from '@/features/billing/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Vista previa imprimible de la factura. Se puede mandar a la impresora termica
// (backend) o imprimir/guardar como PDF por el navegador (window.print).
export function FacturaPreviewDialog({
  cuenta,
  abierto,
  onCerrar,
}: {
  cuenta: CuentaPagada
  abierto: boolean
  onCerrar: () => void
}) {
  const { data: negocio } = useQuery(negocioConfigQuery)
  const imprimir = useImprimirFactura()

  const p = cuenta.pedido
  const esDomicilio = p.tipo === 'DOMICILIO'
  const subtotal = Number(cuenta.subtotal)
  const servicio = Number(cuenta.servicio)
  const impuestos = Number(cuenta.impuestos)

  function imprimirTermica() {
    imprimir
      .mutateAsync(cuenta.id_factura)
      .then((r) => {
        if (r.ok) toast.success('Factura enviada a la impresora')
        else toast.error(r.motivo ?? 'No se pudo imprimir')
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2 font-heading tracking-tight">
            <ReceiptText className="size-5 text-primary" /> Factura #{cuenta.id_factura}
          </DialogTitle>
          <DialogDescription>Vista previa del recibo del cliente.</DialogDescription>
        </DialogHeader>

        {/* Recibo (papel): se ve igual en pantalla y al imprimir. */}
        <div className="factura-print mx-auto w-full max-w-xs rounded-md bg-white p-5 font-mono text-black">
          <div className="text-center">
            <p className="text-sm font-bold uppercase">{negocio?.nombre_negocio ?? 'Factura de venta'}</p>
            {negocio?.nit_negocio ? <p className="text-[11px]">NIT {negocio.nit_negocio}</p> : null}
            {negocio?.direccion_negocio ? <p className="text-[11px]">{negocio.direccion_negocio}</p> : null}
            {negocio?.telefono_negocio ? <p className="text-[11px]">Tel: {negocio.telefono_negocio}</p> : null}
          </div>

          <Separador />

          <p className="text-[11px] font-bold">FACTURA DE VENTA No. {cuenta.id_factura}</p>
          <p className="text-[11px]">{fechaHora(cuenta.fecha)}</p>
          {esDomicilio ? (
            <>
              <p className="text-[11px]">Domicilio{p.cliente?.nombre ? ` · ${p.cliente.nombre}` : ''}</p>
              {p.cliente?.telefono ? <p className="text-[11px]">Tel: {p.cliente.telefono}</p> : null}
              {p.cliente?.direccion ? <p className="text-[11px]">Dir: {p.cliente.direccion}</p> : null}
            </>
          ) : (
            <p className="text-[11px]">{p.ficha_numero ? `Ficha ${p.ficha_numero}` : 'Pedido sin ficha'}</p>
          )}
          {p.mesero ? <p className="text-[11px]">Mesero: {p.mesero}</p> : null}
          {cuenta.cajero ? <p className="text-[11px]">Cajero: {cuenta.cajero}</p> : null}

          <Separador />

          <div className="space-y-1">
            {cuenta.items.map((item) => {
              const cantidad = item.cantidad * Number(item.proporcion)
              const cantidadTexto = Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(2)
              return <Linea key={item.id} izq={`${cantidadTexto}× ${item.nombre}`} der={Number(item.subtotal)} />
            })}
          </div>

          <Separador />

          <div className="space-y-1">
            <Linea izq="Subtotal" der={subtotal} />
            {servicio > 0 ? <Linea izq="Propina" der={servicio} /> : null}
            {impuestos > 0 ? <Linea izq="Impuestos" der={impuestos} /> : null}
            <div className="flex justify-between gap-2 text-sm font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatearPrecio(Number(cuenta.total))}</span>
            </div>
          </div>

          <Separador />

          <div className="space-y-1">
            {cuenta.pagos.map((pago, i) => (
              <Linea key={i} izq={ETIQUETA_METODO[pago.metodo]} der={Number(pago.monto)} />
            ))}
            {/* Excedente voluntario ("quedese con el vuelto"), aparte del total. */}
            {cuenta.pagos.map((pago, i) =>
              Number(pago.excedente) > 0 ? (
                <Linea
                  key={`exc-${i}`}
                  izq={pago.destino === 'PROPINA' ? 'Propina adicional' : 'Excedente'}
                  der={Number(pago.excedente)}
                />
              ) : null,
            )}
          </div>

          <Separador />
          <p className="text-center text-[11px]">¡Gracias por su compra!</p>
        </div>

        <div className="no-print flex flex-col gap-2 sm:flex-row">
          <Button className="btn-heat flex-1 gap-2" disabled={imprimir.isPending} onClick={imprimirTermica}>
            {imprimir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Imprimir en térmica
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={() => window.print()}>
            <ReceiptText className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Separador() {
  return <div className="my-2 border-t border-dashed border-black/40" />
}

function Linea({ izq, der, pequeno }: { izq: string; der: number; pequeno?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${pequeno ? 'text-[10px]' : 'text-[11px]'}`}>
      <span>{izq}</span>
      <span className="tabular-nums">{formatearPrecio(der)}</span>
    </div>
  )
}
