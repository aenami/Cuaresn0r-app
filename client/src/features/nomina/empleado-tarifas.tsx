import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import { tarifasEmpleadoQuery, useCrearTarifa } from '@/features/nomina/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorApi } from './comun'

export function Tarifas({ idEmpleado, esAdmin, activo }: { idEmpleado: number; esAdmin: boolean; activo: boolean }) {
  const { data: tarifas, isPending } = useQuery(tarifasEmpleadoQuery(idEmpleado))
  const crear = useCrearTarifa(idEmpleado)
  const [valor, setValor] = useState('')
  const [desde, setDesde] = useState('')

  const valorNum = Number(valor)
  const valido = valor !== '' && !Number.isNaN(valorNum) && valorNum > 0

  function guardar() {
    if (!valido) return
    crear
      .mutateAsync({ valorHora: valorNum, ...(desde ? { fechaInicio: desde } : {}) })
      .then(() => {
        toast.success('Nueva tarifa vigente')
        setValor('')
        setDesde('')
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="rounded-xl bg-surface-high">
        <div className="border-b border-border px-5 py-3">
          <h2 className="micro-label">Historial de tarifas</h2>
        </div>
        {isPending ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Cargando…</p>
        ) : (tarifas ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Sin tarifas registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {(tarifas ?? []).map((t) => (
                <tr key={t.id_tarifaEmpleado} className="border-b border-border/40 last:border-0">
                  <td className="py-3 pl-5 pr-3 font-heading text-lg font-semibold tabular-nums">
                    {formatearPrecio(t.valor_hora_tarifaEmpleado)}
                    <span className="text-xs font-normal text-muted-foreground"> /h</span>
                  </td>
                  <td className="py-3 pr-3 tabular-nums text-muted-foreground">
                    desde {formatearFecha(t.fecha_inicio_tarifaEmpleado)}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    {t.tarifa_activa ? (
                      <span className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Vigente
                      </span>
                    ) : (
                      <span className="micro-label">Historica</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {esAdmin ? (
        <section className="h-fit rounded-xl border border-border bg-surface-high p-5">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Nueva tarifa</h2>
          <p className="mt-1 text-xs text-muted-foreground">Crea una version nueva (desactiva la vigente).</p>
          {!activo ? (
            <p className="mt-3 text-xs text-destructive">El empleado esta retirado; no admite nuevas tarifas.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tar-valor">Valor por hora</Label>
                <Input id="tar-valor" type="number" min={0} step={100} inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tar-desde">Vigente desde</Label>
                <Input id="tar-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                <p className="text-xs text-muted-foreground">Si se deja vacio, rige desde hoy.</p>
              </div>
              <Button className="btn-heat w-full gap-2" disabled={!valido || crear.isPending} onClick={guardar}>
                {crear.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Guardar tarifa
              </Button>
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Solo un administrador puede cambiar tarifas.
        </div>
      )}
    </div>
  )
}
