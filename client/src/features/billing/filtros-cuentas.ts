import type { CuentaPorPagar } from '@/types/api'

export type EstadoFiltroCuenta = 'TODAS' | 'PENDIENTE' | 'PAGADA'

export function filtrarCuentas(
  cuentas: CuentaPorPagar[],
  estado: EstadoFiltroCuenta,
  desde: string,
  hasta: string,
) {
  if (desde && hasta && desde > hasta) return []
  return cuentas.filter((cuenta) => {
    if (
      estado === 'PENDIENTE' &&
      !['PENDIENTE', 'PARCIAL'].includes(cuenta.estado_cuentaPorPagar)
    )
      return false
    if (estado === 'PAGADA' && cuenta.estado_cuentaPorPagar !== 'PAGADA')
      return false
    // Emisión es @db.Date: no convertirla a hora local, que movería el día.
    const fecha = cuenta.fecha_emision_cuentaPorPagar.slice(0, 10)
    return (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
  })
}
