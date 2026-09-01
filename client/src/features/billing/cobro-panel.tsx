import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Ban,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import type { DestinoExcedente, Factura, MetodoPago } from '@/types/api'
import { ApiError } from '@/lib/api'
import { formatearPrecio } from '@/lib/formato'
import { useAnularFactura, useEmitirFactura, useRegistrarPago } from '@/features/billing/api'
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
import type { CuentaCobro } from './cobro-tipos'

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

const ICONO_METODO: Record<MetodoPago, typeof Banknote> = {
  EFECTIVO: Banknote,
  TARJETA: CreditCard,
  TRANSFERENCIA: Smartphone,
}

function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}

export function PanelPago({
  cuenta,
  porcentajeImpuestos,
  propinaSugerida,
  hayTurno,
}: {
  cuenta: CuentaCobro
  porcentajeImpuestos: number
  propinaSugerida: number
  hayTurno: boolean
}) {
  const factura = cuenta.factura

  return (
    <>
      <div className="border-b-4 border-primary px-5 py-4">
        <p className="micro-label">Cobrando</p>
        <p className="mt-0.5 font-heading text-lg font-semibold tracking-tight">{cuenta.nombre}</p>
      </div>

      {!hayTurno && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            No tienes un turno abierto. Ábrelo en{' '}
            <Link to="/caja" className="font-semibold underline underline-offset-2">
              Caja
            </Link>{' '}
            para registrar pagos.
          </span>
        </div>
      )}

      {factura ? (
        <PagoDeFactura factura={factura} hayTurno={hayTurno} />
      ) : (
        <EmisionDeFactura
          cuenta={cuenta}
          porcentajeImpuestos={porcentajeImpuestos}
          propinaSugerida={propinaSugerida}
        />
      )}
    </>
  )
}

// Cuenta sin factura: elige propina y emite.
function EmisionDeFactura({
  cuenta,
  porcentajeImpuestos,
  propinaSugerida,
}: {
  cuenta: CuentaCobro
  porcentajeImpuestos: number
  propinaSugerida: number
}) {
  const emitir = useEmitirFactura()
  // La propina se fija por porcentaje (un preset o "Otro %") o como monto exacto
  // en pesos ("Monto"), para clientes que dejan una cifra puntual.
  const [modo, setModo] = useState<'preset' | 'porcentaje' | 'monto'>('preset')
  const [pct, setPct] = useState<number>(propinaSugerida)
  const [otro, setOtro] = useState('')
  const [montoServicio, setMontoServicio] = useState('')

  const subtotal = cuenta.subtotal
  const impuestos = Math.round(subtotal * porcentajeImpuestos) / 100
  const pctEfectivo = modo === 'porcentaje' ? Number(otro) || 0 : pct
  const montoServicioNum = Number(montoServicio) || 0
  const propina = modo === 'monto' ? montoServicioNum : Math.round(subtotal * pctEfectivo) / 100
  const total = subtotal + impuestos + propina

  const presets = Array.from(new Set([propinaSugerida, 10, 15, 20].filter((n) => n > 0))).sort((a, b) => a - b)

  function emitirFactura() {
    if (subtotal <= 0) return
    const datos =
      modo === 'monto'
        ? { idSubcuenta: cuenta.id, idsDetalle: cuenta.idsDetalleFacturar, montoServicio: montoServicioNum }
        : { idSubcuenta: cuenta.id, idsDetalle: cuenta.idsDetalleFacturar, porcentajePropina: pctEfectivo }
    emitir
      .mutateAsync(datos)
      .then(() => toast.success('Factura emitida'))
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <div className="scrollbar-fina flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
      <div className="space-y-2 text-sm">
        <FilaMonto etiqueta="Subtotal" valor={subtotal} />
        <FilaMonto etiqueta={`Impuestos (${porcentajeImpuestos}%)`} valor={impuestos} />
      </div>

      {/* Propina */}
      <div className="mt-5">
        <p className="micro-label mb-2">Propina</p>
        <div className="flex flex-wrap gap-1.5">
          <BotonPropina activo={modo === 'preset' && pct === 0} onClick={() => { setModo('preset'); setPct(0) }}>
            Sin
          </BotonPropina>
          {presets.map((p) => (
            <BotonPropina
              key={p}
              activo={modo === 'preset' && pct === p}
              onClick={() => { setModo('preset'); setPct(p) }}
            >
              {p}%{p === propinaSugerida ? ' ·' : ''}
            </BotonPropina>
          ))}
          <BotonPropina activo={modo === 'porcentaje'} onClick={() => setModo('porcentaje')}>
            Otro %
          </BotonPropina>
          <BotonPropina activo={modo === 'monto'} onClick={() => setModo('monto')}>
            Monto
          </BotonPropina>
        </div>
        {modo === 'porcentaje' && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              inputMode="decimal"
              placeholder="%"
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              className="h-9 w-24"
              autoFocus
            />
            <span className="text-sm text-muted-foreground">% del subtotal</span>
          </div>
        )}
        {modo === 'monto' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder="0"
              value={montoServicio}
              onChange={(e) => setMontoServicio(e.target.value)}
              className="h-9 w-32"
              autoFocus
            />
            <span className="text-sm text-muted-foreground">exactos de propina</span>
          </div>
        )}
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-muted-foreground">
            {modo === 'monto' ? 'Propina (monto fijo)' : `Propina (${pctEfectivo}%)`}
          </span>
          <span className="tabular-nums">{formatearPrecio(propina)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <span className="font-heading text-sm font-semibold uppercase tracking-wide">Total</span>
        <span className="font-heading text-2xl font-semibold tabular-nums tracking-tighter text-primary">
          {formatearPrecio(total)}
        </span>
      </div>

      <div className="mt-auto pt-5">
        <Button
          className="btn-heat h-12 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
          disabled={subtotal <= 0 || emitir.isPending}
          onClick={emitirFactura}
        >
          {emitir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
          Emitir factura
        </Button>
      </div>
    </div>
  )
}

function BotonPropina({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
        activo ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'bg-surface-high text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// Cuenta con factura vigente: desglose, pagos y saldo.
function PagoDeFactura({ factura, hayTurno }: { factura: Factura; hayTurno: boolean }) {
  const registrar = useRegistrarPago(factura.id_factura)
  const anular = useAnularFactura(factura.id_factura)

  const subtotal = Number(factura.subtotal_factura)
  const servicio = Number(factura.monto_servicio_factura)
  const impuestos = Number(factura.monto_impuestos_factura)
  const total = Number(factura.monto_total_factura)
  const pctPropina = subtotal > 0 ? Math.round((servicio / subtotal) * 100) : 0

  const pagos = factura.pagos ?? []
  const pagadoTotal = pagos.reduce((acc, p) => acc + Number(p.monto_total_pago), 0)
  const saldo = Math.max(0, total - pagadoTotal)
  const estaPagada = factura.estado_factura === 'PAGADA' || saldo <= 0

  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO')
  const [monto, setMonto] = useState('')
  const [recibido, setRecibido] = useState('')
  const [dejaVuelto, setDejaVuelto] = useState(false)
  const [destinoExc, setDestinoExc] = useState<DestinoExcedente>('CASA')
  const [dialogoAnular, setDialogoAnular] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [devolucion, setDevolucion] = useState<{ efectivo: number; porFuera: number } | null>(null)

  const montoNum = monto === '' ? saldo : Number(monto)
  const montoValido = !Number.isNaN(montoNum) && montoNum > 0 && montoNum <= saldo

  // Calculadora de cambio (solo efectivo): el cajero anota con cuanto paga el
  // cliente y ve el vuelto al instante. Ese vuelto puede devolverse o, si el
  // cliente dice "quedese con el", registrarse como excedente (ver abajo).
  const aCobrar = montoValido ? montoNum : saldo
  const recibidoNum = Number(recibido)
  const recibidoValido = recibido !== '' && !Number.isNaN(recibidoNum)
  const cambio = recibidoNum - aCobrar

  // El excedente solo aplica en efectivo, cuando el pago salda la cuenta
  // completa (aCobrar == saldo) y el cliente entrego de mas.
  const esSaldoCompleto = aCobrar === saldo
  const hayVuelto = metodo === 'EFECTIVO' && esSaldoCompleto && cambio > 0
  const excedenteActivo = hayVuelto && dejaVuelto

  function registrarPago() {
    if (!montoValido || !hayTurno) return
    const datos = excedenteActivo
      ? { metodo, monto: montoNum, excedente: cambio, destinoExcedente: destinoExc }
      : { metodo, monto: montoNum }
    registrar
      .mutateAsync(datos)
      .then((r) => {
        setMonto('')
        setRecibido('')
        setDejaVuelto(false)
        toast.success(
          r.estadoFactura === 'PAGADA'
            ? excedenteActivo
              ? `Factura pagada · excedente ${formatearPrecio(cambio)} (${destinoExc === 'CASA' ? 'casa' : 'meseros'})`
              : 'Factura pagada'
            : `Pago registrado · saldo ${formatearPrecio(r.saldoPendiente)}`,
        )
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  function anularFactura() {
    if (motivo.trim() === '') return
    anular
      .mutateAsync(motivo.trim())
      .then((r) => {
        setDialogoAnular(false)
        setMotivo('')
        const efectivo = Number(r.devolucion.efectivoDevuelto)
        const porFuera = Number(r.devolucion.devolverPorFuera)
        toast.success('Factura anulada')
        if (efectivo > 0 || porFuera > 0) setDevolucion({ efectivo, porFuera })
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <div className="scrollbar-fina flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
      {/* Desglose snapshot de la factura */}
      <div className="space-y-2 text-sm">
        <FilaMonto etiqueta="Subtotal" valor={subtotal} />
        <FilaMonto etiqueta={`Propina (${pctPropina}%)`} valor={servicio} />
        <FilaMonto etiqueta="Impuestos" valor={impuestos} />
        <div className="flex items-center justify-between border-t border-border pt-2 font-heading font-semibold">
          <span>Total factura #{factura.id_factura}</span>
          <span className="tabular-nums text-primary">{formatearPrecio(total)}</span>
        </div>
      </div>

      {/* Pagos registrados */}
      {pagos.length > 0 && (
        <div className="mt-4">
          <p className="micro-label mb-2">Pagos</p>
          <ul className="space-y-1.5">
            {pagos.map((p) => {
              const Icono = ICONO_METODO[p.metodo_pago]
              return (
                <li key={p.id_pago} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icono className="size-3.5" /> {ETIQUETA_METODO[p.metodo_pago]}
                  </span>
                  <span className="tabular-nums">{formatearPrecio(p.monto_total_pago)}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">Saldo pendiente</span>
            <span className={cn('font-semibold tabular-nums', estaPagada ? 'text-primary' : 'text-tertiary')}>
              {formatearPrecio(saldo)}
            </span>
          </div>
        </div>
      )}

      {/* Registrar pago (si queda saldo) */}
      {!estaPagada && (
        <div className="mt-5">
          <p className="micro-label mb-2">Metodo de pago</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as MetodoPago[]).map((m) => {
              const Icono = ICONO_METODO[m]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMetodo(m); setRecibido(''); setDejaVuelto(false) }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg py-3 text-xs font-medium transition-colors',
                    metodo === m
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                      : 'bg-surface-high text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icono className="size-4" />
                  {ETIQUETA_METODO[m]}
                </button>
              )
            })}
          </div>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="monto-pago">Monto (por defecto, el saldo)</Label>
            <Input
              id="monto-pago"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder={String(saldo)}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>

          {/* Calculadora de cambio: solo para efectivo */}
          {metodo === 'EFECTIVO' && (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="efectivo-recibido">Efectivo recibido (opcional)</Label>
              <Input
                id="efectivo-recibido"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                placeholder="¿Con cuánto paga el cliente?"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
              />
              {recibidoValido && cambio < 0 && (
                <div className="flex items-center justify-between rounded-lg bg-tertiary/10 px-3 py-2.5 text-sm text-tertiary">
                  <span className="font-medium">Falta para cubrir</span>
                  <span className="font-semibold tabular-nums">{formatearPrecio(-cambio)}</span>
                </div>
              )}

              {/* Vuelto: devolverlo o dejarlo como excedente. Solo cuando el pago
                  salda la cuenta completa (no en abonos parciales). */}
              {recibidoValido && cambio > 0 && hayVuelto && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDejaVuelto(false)}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        !dejaVuelto ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'bg-surface-high text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Devolver vuelto
                    </button>
                    <button
                      type="button"
                      onClick={() => setDejaVuelto(true)}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        dejaVuelto ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'bg-surface-high text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Dejar excedente
                    </button>
                  </div>

                  {!dejaVuelto ? (
                    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
                      <span className="font-medium text-primary">Cambio a devolver</span>
                      <span className="font-heading text-lg font-semibold tabular-nums text-primary">
                        {formatearPrecio(cambio)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between rounded-lg bg-tertiary/10 px-3 py-2.5 text-sm">
                        <span className="font-medium text-tertiary">Excedente (el negocio lo recibe)</span>
                        <span className="font-heading text-lg font-semibold tabular-nums text-tertiary">
                          {formatearPrecio(cambio)}
                        </span>
                      </div>
                      <div>
                        <p className="micro-label mb-1.5">Destino del excedente</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              ['CASA', 'Para la casa'],
                              ['PROPINA', 'Propina meseros'],
                            ] as [DestinoExcedente, string][]
                          ).map(([valor, etiqueta]) => (
                            <button
                              key={valor}
                              type="button"
                              onClick={() => setDestinoExc(valor)}
                              className={cn(
                                'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                                destinoExc === valor
                                  ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                                  : 'bg-surface-high text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {etiqueta}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Abono parcial en efectivo con vuelto: solo se devuelve (no hay
                  excedente hasta que se salde la cuenta). */}
              {recibidoValido && cambio > 0 && !hayVuelto && (
                <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
                  <span className="font-medium text-primary">Cambio a devolver</span>
                  <span className="font-heading text-lg font-semibold tabular-nums text-primary">
                    {formatearPrecio(cambio)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {estaPagada && (
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" /> Cuenta pagada por completo.
        </div>
      )}

      {/* Acciones */}
      <div className="mt-auto space-y-2 pt-5">
        {!estaPagada && (
          <Button
            className="btn-heat h-12 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
            disabled={!montoValido || !hayTurno || registrar.isPending}
            onClick={registrarPago}
          >
            {registrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            Cobrar {formatearPrecio(montoValido ? montoNum : saldo)}
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full gap-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => setDialogoAnular(true)}
        >
          <Ban className="size-3.5" /> Anular factura
        </Button>
      </div>

      {/* Dialogo anular */}
      <Dialog open={dialogoAnular} onOpenChange={setDialogoAnular}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Anular factura</DialogTitle>
            <DialogDescription>
              La factura es inmutable: anularla es una devolución total. El efectivo pagado sale de tu
              caja; tarjeta/transferencia se reversa por fuera.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-anulacion">Motivo</Label>
            <Textarea
              id="motivo-anulacion"
              maxLength={150}
              placeholder="Ej. cobro errado, item mal asignado…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAnular(false)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={motivo.trim() === '' || anular.isPending}
              onClick={anularFactura}
            >
              {anular.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resultado de la devolucion */}
      <Dialog open={devolucion !== null} onOpenChange={(o) => !o && setDevolucion(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Devolución</DialogTitle>
            <DialogDescription>Montos a devolver por la anulación.</DialogDescription>
          </DialogHeader>
          {devolucion && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo (salió de caja)</span>
                <span className="tabular-nums">{formatearPrecio(devolucion.efectivo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reversar por fuera (datáfono/banco)</span>
                <span className="tabular-nums">{formatearPrecio(devolucion.porFuera)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="btn-heat" onClick={() => setDevolucion(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilaMonto({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="tabular-nums">{formatearPrecio(valor)}</span>
    </div>
  )
}
