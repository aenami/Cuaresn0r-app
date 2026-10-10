import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { TurnoResumen } from '@/types/api'
import { errorApi } from './caja-comun'
import { formatearPrecio } from '@/lib/formato'

export function CorreccionCuadre({ turno }: { turno: TurnoResumen }) {
  const usuario = useAuthStore((s) => s.usuario)
  const permitido =
    usuario?.rolNombre === 'ADMIN_LOCAL' && usuario.area === turno.caja?.area
  const [abierto, setAbierto] = useState(false),
    [efectivo, setEfectivo] = useState(''),
    [digital, setDigital] = useState(''),
    [tarjeta, setTarjeta] = useState(''),
    [motivo, setMotivo] = useState('')
  const qc = useQueryClient()
  const guardar = useMutation({
    mutationFn: () =>
      api.patch(`/billing/turnos/${turno.id_turno}/corregir`, {
        montoCierreReal: Number(efectivo),
        ...(digital.trim() ? { transferenciaReal: Number(digital) } : {}),
        ...(tarjeta.trim() ? { tarjetaReal: Number(tarjeta) } : {}),
        motivo: motivo.trim(),
      }),
    onSuccess: async () => {
      await Promise.all(
        ['billing', 'bakery'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      )
      setAbierto(false)
      toast.success('Cuadre corregido; historial conservado')
    },
    onError: (e) => toast.error(errorApi(e)),
  })
  return (
    <section className="space-y-3">
      {permitido ? (
        <Button
          variant="secondary"
          onClick={() => {
            setEfectivo(turno.monto_cierre_real_turno ?? '0')
            setDigital(turno.transferencia_real_cierre ?? '')
            setTarjeta(turno.tarjeta_real_cierre ?? '')
            setMotivo('')
            setAbierto(true)
          }}
        >
          Corregir cuadre cerrado
        </Button>
      ) : null}
      {turno.correcciones?.length ? (
        <details>
          <summary className="cursor-pointer text-sm text-tertiary">
            Historial de correcciones ({turno.correcciones.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {turno.correcciones.map((c) => (
              <li key={c.id} className="border-t border-border pt-3 text-sm">
                <p className="font-semibold">{c.motivo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.fecha).toLocaleString('es-CO')} ·{' '}
                  {c.usuario?.email_usuario ?? 'Administrador local'}
                </p>
                <p>
                  Efectivo: {formatearPrecio(c.anterior.efectivo ?? 0)} →{' '}
                  {formatearPrecio(c.nuevo.efectivo ?? 0)}
                </p>
                <p className="text-xs">
                  Nequi: {c.anterior.transferencia ?? 'Sin declarar'} →{' '}
                  {c.nuevo.transferencia ?? 'Sin declarar'} · Tarjeta:{' '}
                  {c.anterior.tarjeta ?? 'Sin declarar'} →{' '}
                  {c.nuevo.tarjeta ?? 'Sin declarar'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <Dialog
        open={abierto}
        onOpenChange={(v) => !guardar.isPending && setAbierto(v)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir cuadre #{turno.id_turno}</DialogTitle>
            <DialogDescription>
              Corrige los importes declarados. No se reabre el turno ni se
              alteran ventas, pagos o conteos de inventario. El valor anterior
              queda en el historial.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="cor-cash">Efectivo contado, incluyendo base</Label>
          <Input
            id="cor-cash"
            type="number"
            min="0"
            step="0.01"
            value={efectivo}
            onChange={(e) => setEfectivo(e.target.value)}
          />
          <Label htmlFor="cor-digital">Neto de transferencias / Nequi</Label>
          <Input
            id="cor-digital"
            type="number"
            step="0.01"
            value={digital}
            onChange={(e) => setDigital(e.target.value)}
            placeholder="Vacío: conservar dato anterior"
          />
          <Label htmlFor="cor-card">Recibido por tarjeta</Label>
          <Input
            id="cor-card"
            type="number"
            min="0"
            step="0.01"
            value={tarjeta}
            onChange={(e) => setTarjeta(e.target.value)}
            placeholder="Vacío: conservar dato anterior"
          />
          <Label htmlFor="cor-motivo">Motivo de la corrección</Label>
          <Input
            id="cor-motivo"
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Button
            disabled={
              guardar.isPending ||
              !efectivo.trim() ||
              !Number.isFinite(Number(efectivo)) ||
              Number(efectivo) < 0 ||
              (digital.trim() !== '' && !Number.isFinite(Number(digital))) ||
              (tarjeta.trim() !== '' &&
                (!Number.isFinite(Number(tarjeta)) || Number(tarjeta) < 0)) ||
              motivo.trim().length < 3
            }
            onClick={() => guardar.mutate()}
          >
            Guardar corrección
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
