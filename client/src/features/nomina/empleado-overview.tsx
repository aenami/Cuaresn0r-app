import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgePlus, Loader2, Power, Wallet } from 'lucide-react'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import {
  conceptosQuery,
  nominaConfigQuery,
  pagosEmpleadoQuery,
  tarifasEmpleadoQuery,
  useAplicarConcepto,
  useDesactivarEmpleado,
  useReactivarEmpleado,
} from '@/features/nomina/api'
import { construirLedger, quincenaActual } from '@/features/nomina/ledger'
import { LedgerLista } from '@/features/nomina/ledger-lista'
import type { SaldoEmpleado } from '@/types/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorApi } from './comun'

export function Overview({
  idEmpleado,
  saldo,
  esAdmin,
  activo,
  onPagar,
}: {
  idEmpleado: number
  saldo: SaldoEmpleado | undefined
  esAdmin: boolean
  activo: boolean
  onPagar: () => void
}) {
  // Tarifas y config son solo-ADMIN en el backend: el cajero no las consulta.
  const { data: tarifas } = useQuery({ ...tarifasEmpleadoQuery(idEmpleado), enabled: esAdmin })
  const { data: pagos } = useQuery(pagosEmpleadoQuery(idEmpleado))
  const { data: config } = useQuery({ ...nominaConfigQuery, enabled: esAdmin })
  const [aplicarConcepto, setAplicarConcepto] = useState(false)

  const ledger = useMemo(() => construirLedger(saldo?.devengos ?? [], pagos ?? []).slice(0, 5), [saldo, pagos])
  const quincena = useMemo(() => quincenaActual(saldo?.devengos ?? []), [saldo])

  const tarifaActiva = (tarifas ?? []).find((t) => t.tarifa_activa)
  const versiones = (tarifas ?? []).length
  const pctRecargo = config?.aplica_recargo_nocturno ? Number(config.porcentaje_recargo_nocturno ?? 0) : 0
  const valorHora = Number(tarifaActiva?.valor_hora_tarifaEmpleado ?? 0)
  const valorNocturno = valorHora * (1 + pctRecargo / 100)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* Columna principal */}
      <div className="space-y-6">
        <section className="rounded-xl bg-surface-high">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="micro-label">Movimientos recientes</h2>
          </div>
          {ledger.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Sin movimientos todavia.</p>
          ) : (
            <LedgerLista filas={ledger} />
          )}
        </section>

        {esAdmin ? (
        <section className="rounded-xl bg-surface-high p-5">
          <div className="flex items-center justify-between">
            <h2 className="micro-label">Estructura de tarifa</h2>
            {tarifaActiva ? (
              <span className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                v{versiones}
              </span>
            ) : null}
          </div>
          {tarifaActiva ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-lowest p-4">
                  <p className="micro-label">Tarifa estandar</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">{formatearPrecio(valorHora)}<span className="text-sm font-normal text-muted-foreground"> /h</span></p>
                </div>
                <div className="rounded-lg bg-surface-lowest p-4">
                  <p className="micro-label">{pctRecargo > 0 ? `Hora nocturna (+${pctRecargo}%)` : 'Hora nocturna'}</p>
                  <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-tertiary">
                    {formatearPrecio(valorNocturno)}<span className="text-sm font-normal text-muted-foreground"> /h</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Vigente desde {formatearFecha(tarifaActiva.fecha_inicio_tarifaEmpleado)}.
                {pctRecargo === 0 ? ' Sin recargo nocturno configurado.' : ''}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Sin tarifa activa. Asignala en la pestaña Tarifas para poder liquidar jornadas.</p>
          )}
        </section>
        ) : null}
      </div>

      {/* Columna lateral */}
      <div className="space-y-6">
        <section className="rounded-xl bg-surface-high p-5">
          <h2 className="micro-label">Acciones rapidas</h2>
          <div className="mt-3 space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onPagar}>
              <Wallet className="size-4" /> Registrar pago
            </Button>
            {esAdmin ? (
              <Button variant="outline" className="w-full justify-start gap-2" disabled={!activo} onClick={() => setAplicarConcepto(true)}>
                <BadgePlus className="size-4" /> Aplicar concepto
              </Button>
            ) : null}
            {esAdmin ? <SuspenderAccion idEmpleado={idEmpleado} activo={activo} /> : null}
          </div>
        </section>

        <section className="rounded-xl border-t-2 border-primary bg-surface-high p-5">
          <p className="micro-label">
            Periodo actual · {quincena.inicio.slice(5)} a {quincena.fin.slice(5)}
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <FilaDato etiqueta="Horas ordinarias" valor={`${quincena.ordinarias.toFixed(1)} h`} />
            <FilaDato etiqueta="Horas nocturnas" valor={`${quincena.nocturnas.toFixed(1)} h`} acento="text-tertiary" />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="micro-label">Devengado en la quincena</span>
            <span className="font-heading text-lg font-semibold tabular-nums text-primary">{formatearPrecio(quincena.monto)}</span>
          </div>
        </section>
      </div>

      <AplicarConceptoDialog idEmpleado={idEmpleado} abierto={aplicarConcepto} onCerrar={() => setAplicarConcepto(false)} />
    </div>
  )
}

function FilaDato({ etiqueta, valor, acento }: { etiqueta: string; valor: string; acento?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={cn('tabular-nums', acento)}>{valor}</span>
    </div>
  )
}

function SuspenderAccion({ idEmpleado, activo }: { idEmpleado: number; activo: boolean }) {
  const desactivar = useDesactivarEmpleado(idEmpleado)
  const reactivar = useReactivarEmpleado(idEmpleado)
  const mut = activo ? desactivar : reactivar
  return (
    <Button
      variant="outline"
      className={cn('w-full justify-start gap-2', activo ? 'text-destructive hover:text-destructive' : 'text-primary')}
      disabled={mut.isPending}
      onClick={() =>
        mut
          .mutateAsync()
          .then(() => toast.success(activo ? 'Empleado retirado' : 'Empleado reactivado'))
          .catch((e: unknown) => toast.error(errorApi(e)))
      }
    >
      <Power className="size-4" /> {activo ? 'Retirar empleado' : 'Reactivar empleado'}
    </Button>
  )
}

function AplicarConceptoDialog({ idEmpleado, abierto, onCerrar }: { idEmpleado: number; abierto: boolean; onCerrar: () => void }) {
  // El catalogo de conceptos es solo-ADMIN; se pide solo al abrir el dialogo.
  const { data: conceptos } = useQuery({ ...conceptosQuery, enabled: abierto })
  const aplicar = useAplicarConcepto(idEmpleado)
  const [idConcepto, setIdConcepto] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [obs, setObs] = useState('')

  useEffect(() => {
    if (abierto) {
      setIdConcepto('')
      setCantidad('1')
      setObs('')
    }
  }, [abierto])

  const cantNum = Number(cantidad)
  const valido = idConcepto !== '' && !Number.isNaN(cantNum) && cantNum > 0
  const concepto = (conceptos ?? []).find((c) => String(c.id_conceptoNomina) === idConcepto)

  function guardar() {
    if (!valido) return
    aplicar
      .mutateAsync({ idConcepto: Number(idConcepto), cantidad: cantNum, ...(obs.trim() ? { observacion: obs.trim() } : {}) })
      .then(() => {
        toast.success('Concepto aplicado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Aplicar concepto</DialogTitle>
          <DialogDescription>Incentivo, bono o deduccion manual sobre la cuenta del empleado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Concepto</Label>
            <Select value={idConcepto} onValueChange={setIdConcepto}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un concepto" />
              </SelectTrigger>
              <SelectContent>
                {(conceptos ?? []).map((c) => (
                  <SelectItem key={c.id_conceptoNomina} value={String(c.id_conceptoNomina)}>
                    {c.nombre_conceptoNomina} ({c.tipo_conceptoNomina === 'INGRESO' ? 'ingreso' : 'deduccion'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {concepto?.valores?.[0] ? (
              <p className="text-xs text-muted-foreground">
                Valor vigente: {formatearPrecio(concepto.valores[0].monto_valorConceptoNomina)} × cantidad.
              </p>
            ) : idConcepto !== '' ? (
              <p className="text-xs text-destructive">Este concepto no tiene un valor activo configurado.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="con-cant">Cantidad</Label>
            <Input id="con-cant" type="number" min={0} step={1} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="con-obs">Observacion (opcional)</Label>
            <Textarea id="con-obs" maxLength={150} value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="btn-heat gap-2" disabled={!valido || aplicar.isPending} onClick={guardar}>
            {aplicar.isPending ? <Loader2 className="size-4 animate-spin" /> : <BadgePlus className="size-4" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
