import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { pagosEmpleadoQuery } from '@/features/nomina/api'
import { construirLedger } from '@/features/nomina/ledger'
import { LedgerLista } from '@/features/nomina/ledger-lista'
import type { SaldoEmpleado } from '@/types/api'
import { Button } from '@/components/ui/button'

export function LedgerCompleto({ idEmpleado, saldo }: { idEmpleado: number; saldo: SaldoEmpleado | undefined }) {
  const { data: pagos } = useQuery(pagosEmpleadoQuery(idEmpleado))
  const ledger = useMemo(() => construirLedger(saldo?.devengos ?? [], pagos ?? []), [saldo, pagos])

  function exportarCSV() {
    const filas = [
      ['Fecha', 'Tipo', 'Descripcion', 'Monto', 'Saldo'],
      ...ledger.map((f) => [f.fecha.slice(0, 10), f.tipo, f.descripcion, f.monto.toFixed(2), f.balance.toFixed(2)]),
    ]
    const csv = filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `movimientos_empleado_${idEmpleado}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl bg-surface-high">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="micro-label">Cuenta corriente</h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={exportarCSV}>
          <Download className="size-4" /> Exportar
        </Button>
      </div>
      {ledger.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Sin movimientos todavia.</p>
      ) : (
        <LedgerLista filas={ledger} />
      )}
    </section>
  )
}
