import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Wallet } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { useRegistrarPagoNomina } from '@/features/nomina/api'
import type { MetodoPagoNomina } from '@/types/api'
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

export function PagoDialog({
  idEmpleado,
  saldo,
  abierto,
  onCerrar,
}: {
  idEmpleado: number
  saldo: number
  abierto: boolean
  onCerrar: () => void
}) {
  const registrar = useRegistrarPagoNomina(idEmpleado)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPagoNomina>('TRANSFERENCIA')
  const [obs, setObs] = useState('')

  useEffect(() => {
    if (abierto) {
      setMonto('')
      setMetodo('TRANSFERENCIA')
      setObs('')
    }
  }, [abierto])

  const montoNum = Number(monto)
  const valido = monto !== '' && !Number.isNaN(montoNum) && montoNum > 0 && montoNum <= saldo

  function guardar() {
    if (!valido) return
    registrar
      .mutateAsync({ monto: montoNum, metodo, ...(obs.trim() ? { observacion: obs.trim() } : {}) })
      .then((r) => {
        toast.success(`Pago registrado · saldo ${formatearPrecio(r.nuevoSaldo)}`)
        onCerrar()
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Registrar pago</DialogTitle>
          <DialogDescription>
            Saldo pendiente: {formatearPrecio(saldo)}. No se permiten adelantos (el pago no puede superarlo).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pago-monto">Monto</Label>
            <Input id="pago-monto" type="number" min={0} step={100} inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus />
            {monto !== '' && montoNum > saldo ? <p className="text-xs text-destructive">Supera el saldo pendiente.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Metodo</Label>
            <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoPagoNomina)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                <SelectItem value="EFECTIVO">Efectivo (sale de tu caja)</SelectItem>
              </SelectContent>
            </Select>
            {metodo === 'EFECTIVO' ? (
              <p className="text-xs text-muted-foreground">Requiere un turno de caja abierto tuyo con efectivo suficiente.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pago-obs">Observacion (opcional)</Label>
            <Textarea id="pago-obs" maxLength={150} value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="btn-heat gap-2" disabled={!valido || registrar.isPending} onClick={guardar}>
            {registrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
