import type { DevengoConSaldo, PagoNomina } from '@/types/api'

// Cuenta corriente del empleado: mezcla devengos + pagos en orden cronologico
// con saldo corrido. Lo comparten el perfil del ADMIN (empleados.$id) y el
// autoservicio del empleado (mi-nomina). Ver tambien ./ledger-lista.tsx.

export type TipoFila = 'ACCRUAL' | 'DEDUCCION' | 'PAGO'

export interface FilaLedger {
  clave: string
  fecha: string
  tipo: TipoFila
  descripcion: string
  monto: number // firmado: + devengo, - pago
  balance: number
}

export function describirDevengo(d: DevengoConSaldo): string {
  if (d.id_jornada_devengoNomina !== null) {
    const ord = Number(d.horas_ordinarias_devengoNomina ?? 0)
    const noc = Number(d.horas_recargo_devengoNomina ?? 0)
    const horas = (ord + noc).toFixed(1)
    return noc > 0 ? `Jornada · ${horas}h (${noc.toFixed(1)}h noct.)` : `Jornada · ${horas}h`
  }
  // Devengo "puro" (sin jornada ni concepto): es una propina repartida.
  if (d.id_conceptoNominaEmpleado_devengoNomina === null) return 'Propinas'
  return Number(d.monto_devengoNomina) >= 0 ? 'Concepto (ingreso)' : 'Concepto (deduccion)'
}

export function construirLedger(devengos: DevengoConSaldo[], pagos: PagoNomina[]): FilaLedger[] {
  type Evento = { clave: string; fecha: string; tipo: TipoFila; descripcion: string; monto: number; orden: number }
  const eventos: Evento[] = []
  for (const d of devengos) {
    const monto = Number(d.monto_devengoNomina)
    eventos.push({
      clave: `d${d.id_devengoNomina}`,
      fecha: d.fecha_devengoNomina,
      tipo: monto >= 0 ? 'ACCRUAL' : 'DEDUCCION',
      descripcion: describirDevengo(d),
      monto,
      orden: 0, // los devengos del dia van antes que los pagos
    })
  }
  for (const p of pagos) {
    eventos.push({
      clave: `p${p.id_pagoNomina}`,
      fecha: p.fecha_pagoNomina,
      tipo: 'PAGO',
      descripcion: `Pago ${p.metodo_pagoNomina.toLowerCase()}${p.observacion_pagoNomina ? ` · ${p.observacion_pagoNomina}` : ''}`,
      monto: -Number(p.monto_pagoNomina),
      orden: 1,
    })
  }
  eventos.sort((a, b) => {
    const t = new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    return t !== 0 ? t : a.orden - b.orden
  })
  let balance = 0
  const filas: FilaLedger[] = eventos.map((e) => {
    balance += e.monto
    return { clave: e.clave, fecha: e.fecha, tipo: e.tipo, descripcion: e.descripcion, monto: e.monto, balance }
  })
  return filas.reverse() // mas reciente primero
}

// Suma de horas/monto de la quincena en curso (1–15 / 16–fin de mes).
export function quincenaActual(devengos: DevengoConSaldo[]) {
  const hoy = new Date()
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const enPrimera = hoy.getDate() <= 15
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const inicio = enPrimera ? fmt(new Date(y, m, 1)) : fmt(new Date(y, m, 16))
  const fin = enPrimera ? fmt(new Date(y, m, 15)) : fmt(new Date(y, m + 1, 0))
  let ordinarias = 0
  let nocturnas = 0
  let monto = 0
  for (const d of devengos) {
    const dia = d.fecha_devengoNomina.slice(0, 10)
    if (dia < inicio || dia > fin) continue
    ordinarias += Number(d.horas_ordinarias_devengoNomina ?? 0)
    nocturnas += Number(d.horas_recargo_devengoNomina ?? 0)
    monto += Number(d.monto_devengoNomina)
  }
  return { inicio, fin, ordinarias, nocturnas, monto }
}
