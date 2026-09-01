import type { DetalleComanda, Factura } from '@/types/api'

// Una cuenta (subcuenta) lista para cobrar: sus items, subtotal preview y su
// factura vigente si ya se emitio. Compartida por la lista de cuentas y el panel
// de pago.
export interface CuentaCobro {
  id: number
  nombre: string
  esPrincipal: boolean
  items: DetalleComanda[]
  subtotal: number
  hayPreparando: boolean
  idsDetalleFacturar: number[]
  factura: Factura | undefined
}
