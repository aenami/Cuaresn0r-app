import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ClipboardCheck,
  Coins,
  Download,
  Loader2,
  Lock,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { TurnoResumen } from '@/types/api'
import { formatearPrecio } from '@/lib/formato'
import {
  cajasQuery,
  useAbrirTurno,
  useCerrarTurno,
  useRegistrarMovimiento,
} from '@/features/billing/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { errorApi, horaCorta } from './caja-comun'
import { FilaResumen, KpiCard } from './caja-kpis'

// Denominaciones COP: billetes y monedas en circulacion.
const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000]
const MONEDAS = [1000, 500, 200, 100, 50]

type TipoLedger = 'APERTURA' | 'VENTA' | 'INGRESO' | 'RETIRO'

interface FilaLedger {
  clave: string
  hora: string
  tipo: TipoLedger
  descripcion: string
  usuario: string
  monto: number
}

const ESTILO_TIPO: Record<TipoLedger, string> = {
  APERTURA: 'border-tertiary/40 text-tertiary',
  VENTA: 'border-primary/40 text-primary',
  INGRESO: 'border-primary/40 text-primary',
  RETIRO: 'border-border text-muted-foreground',
}

// Unifica apertura + ventas en efectivo + movimientos manuales en un solo
// registro cronologico. Solo el efectivo toca el cajon; tarjeta/transferencia
// se ven en los KPIs, no aqui.
function construirLedger(turno: TurnoResumen): FilaLedger[] {
  const usuario = turno.usuario?.email_usuario ?? `USR_${turno.id_usuario_turno}`
  const filas: FilaLedger[] = [
    {
      clave: 'apertura',
      hora: turno.fecha_apertura_turno,
      tipo: 'APERTURA',
      descripcion: 'Fondo de caja inicial',
      usuario,
      monto: Number(turno.monto_apertura_turno),
    },
  ]
  for (const p of turno.pagos) {
    if (p.metodo !== 'EFECTIVO') continue
    filas.push({
      clave: `p${p.id_pago}`,
      hora: p.fecha,
      tipo: 'VENTA',
      descripcion: `Pedido #${p.id_pedido} (efectivo)`,
      usuario,
      monto: Number(p.monto),
    })
  }
  for (const m of turno.movimientosCaja) {
    filas.push({
      clave: `m${m.id_mc}`,
      hora: m.fecha_mc,
      tipo: m.tipo_mc === 'INGRESO' ? 'INGRESO' : 'RETIRO',
      descripcion: m.concepto_mc,
      usuario,
      monto: m.tipo_mc === 'INGRESO' ? Number(m.monto_mc) : -Number(m.monto_mc),
    })
  }
  return filas.sort((a, b) => new Date(a.hora).getTime() - new Date(b.hora).getTime())
}

function exportarCSV(filas: FilaLedger[], idTurno: number) {
  const filasCsv = [
    ['Hora', 'Tipo', 'Descripcion', 'Usuario', 'Monto'],
    ...filas.map((f) => [new Date(f.hora).toLocaleString('es-CO'), f.tipo, f.descripcion, f.usuario, f.monto.toFixed(2)]),
  ]
  const csv = filasCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `movimientos_turno_${idTurno}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Flujo de efectivo (dashboard del turno) ----

export function FlujoEfectivo({ turno }: { turno: TurnoResumen }) {
  const cerrar = useCerrarTurno(turno.id_turno)
  const [conteo, setConteo] = useState<Record<number, string>>({})
  const [dialogoCierre, setDialogoCierre] = useState(false)
  const [dialogoArqueo, setDialogoArqueo] = useState(false)
  const [resultado, setResultado] = useState<{ esperado: number; real: number } | null>(null)

  const esperado = Number(turno.monto_cierre_esperado ?? turno.monto_apertura_turno)
  const totalContado = [...BILLETES, ...MONEDAS].reduce(
    (acc, d) => acc + d * (parseInt(conteo[d] || '0', 10) || 0),
    0,
  )

  const ventasNetas = turno.pagosPorMetodo.reduce((acc, p) => acc + Number(p.total ?? 0), 0)
  const tarjetas = Number(turno.pagosPorMetodo.find((p) => p.metodo === 'TARJETA')?.total ?? 0)
  const egresos = turno.movimientosCaja.filter((m) => m.tipo_mc === 'EGRESO')
  const retiros = egresos.reduce((acc, m) => acc + Number(m.monto_mc), 0)

  const filas = construirLedger(turno)

  function cerrarTurno() {
    const conteoNum = Object.fromEntries(
      [...BILLETES, ...MONEDAS]
        .map((d) => [d, parseInt(conteo[d] || '0', 10) || 0] as const)
        .filter(([, v]) => v > 0),
    )
    cerrar
      .mutateAsync({ montoCierreReal: totalContado, conteo: conteoNum })
      .then((t) => {
        setDialogoCierre(false)
        setResultado({
          esperado: Number(t.monto_cierre_esperado ?? 0),
          real: Number(t.monto_cierre_real_turno ?? 0),
        })
        setConteo({})
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  const diferenciaResultado = resultado ? resultado.real - resultado.esperado : 0

  return (
    <div className="space-y-8">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-semibold uppercase tracking-tight md:text-5xl">
            Flujo<span className="text-primary">_</span>Efectivo
          </h1>
          <p className="micro-label mt-2">
            Resumen de caja · Turno #{turno.id_turno} · {turno.caja?.nombre_caja}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11 gap-2" onClick={() => setDialogoArqueo(true)}>
            <ClipboardCheck className="size-4" /> Arqueo de caja
          </Button>
          <Button
            className="btn-heat h-11 gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
            onClick={() => setDialogoCierre(true)}
          >
            <Lock className="size-4" /> Cerrar turno
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icono={Banknote}
          titulo="Total efectivo"
          valor={formatearPrecio(esperado)}
          sub={`Fondo inicial: ${formatearPrecio(turno.monto_apertura_turno)}`}
          acento="border-b-2 border-primary"
        />
        <KpiCard
          icono={TrendingUp}
          titulo="Ventas netas"
          valor={formatearPrecio(ventasNetas)}
          sub={`Tarjetas: ${formatearPrecio(tarjetas)}`}
          acento="border-b-2 border-tertiary"
        />
        <KpiCard
          icono={ArrowUpRight}
          titulo="Retiros / pagos"
          valor={formatearPrecio(-retiros)}
          sub={`${egresos.length} ${egresos.length === 1 ? 'movimiento' : 'movimientos'}`}
          acento="border-b-2 border-border"
        />
      </div>

      {/* Conteo de efectivo */}
      <section className="rounded-xl border-l-2 border-primary bg-surface-high p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold uppercase tracking-wide">Conteo de efectivo (COP)</h2>
          <p className="font-heading text-sm font-semibold tabular-nums text-tertiary">
            Total: {formatearPrecio(totalContado)}
          </p>
        </div>

        <p className="micro-label mt-5 flex items-center gap-1.5">
          <Banknote className="size-3.5 text-primary" /> Billetes
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {BILLETES.map((d) => (
            <CampoDenominacion key={d} valor={d} cantidad={conteo[d] ?? ''} onCambiar={(v) => setConteo((c) => ({ ...c, [d]: v }))} />
          ))}
        </div>

        <p className="micro-label mt-5 flex items-center gap-1.5">
          <Coins className="size-3.5 text-primary" /> Monedas
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MONEDAS.map((d) => (
            <CampoDenominacion key={d} valor={d} cantidad={conteo[d] ?? ''} onCambiar={(v) => setConteo((c) => ({ ...c, [d]: v }))} />
          ))}
        </div>
      </section>

      {/* Registro de movimientos */}
      <RegistroMovimientos turno={turno} filas={filas} />

      {/* Dialogo: arqueo (chequeo sin cerrar) */}
      <Dialog open={dialogoArqueo} onOpenChange={setDialogoArqueo}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-tight">Arqueo de caja</DialogTitle>
            <DialogDescription>Chequeo del conteo actual contra lo esperado. No cierra el turno.</DialogDescription>
          </DialogHeader>
          <ComparacionCuadre contado={totalContado} esperado={esperado} />
          <DialogFooter>
            <Button className="btn-heat" onClick={() => setDialogoArqueo(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogo: confirmar cierre */}
      <Dialog open={dialogoCierre} onOpenChange={setDialogoCierre}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-tight">Cerrar turno</DialogTitle>
            <DialogDescription>
              Se cierra con el total contado en el conteo de efectivo. Revisa antes de confirmar.
            </DialogDescription>
          </DialogHeader>
          <ComparacionCuadre contado={totalContado} esperado={esperado} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoCierre(false)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={cerrar.isPending}
              onClick={cerrarTurno}
            >
              {cerrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Confirmar cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogo: resultado del cierre */}
      <Dialog open={resultado !== null} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-tight">Turno cerrado</DialogTitle>
            <DialogDescription>Resumen del cuadre de efectivo.</DialogDescription>
          </DialogHeader>
          {resultado && (
            <div className="space-y-2 text-sm">
              <FilaResumen etiqueta="Esperado" valor={resultado.esperado} />
              <FilaResumen etiqueta="Contado" valor={resultado.real} />
              <div className="mt-1 flex justify-between border-t border-border pt-2 font-medium">
                <span>{diferenciaResultado === 0 ? 'Cuadra' : diferenciaResultado > 0 ? 'Sobrante' : 'Faltante'}</span>
                <span
                  className={cn(
                    'tabular-nums',
                    diferenciaResultado === 0 ? 'text-primary' : diferenciaResultado > 0 ? 'text-tertiary' : 'text-destructive',
                  )}
                >
                  {formatearPrecio(Math.abs(diferenciaResultado))}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="btn-heat" onClick={() => setResultado(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CampoDenominacion({ valor, cantidad, onCambiar }: { valor: number; cantidad: string; onCambiar: (v: string) => void }) {
  return (
    <div>
      <label className="micro-label block">{formatearPrecio(valor)}</label>
      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder="0"
        value={cantidad}
        onChange={(e) => onCambiar(e.target.value)}
        className="mt-1 bg-surface-lowest text-center tabular-nums"
      />
    </div>
  )
}

function ComparacionCuadre({ contado, esperado }: { contado: number; esperado: number }) {
  const diferencia = contado - esperado
  return (
    <div className="space-y-2 text-sm">
      <FilaResumen etiqueta="Contado" valor={contado} />
      <FilaResumen etiqueta="Esperado" valor={esperado} />
      <div className="mt-1 flex justify-between border-t border-border pt-2 font-medium">
        <span>{diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
        <span
          className={cn(
            'tabular-nums',
            diferencia === 0 ? 'text-primary' : diferencia > 0 ? 'text-tertiary' : 'text-destructive',
          )}
        >
          {formatearPrecio(Math.abs(diferencia))}
        </span>
      </div>
    </div>
  )
}

// Filtro por tipo del registro de movimientos (TODOS = sin filtrar).
const OPCIONES_FILTRO: { valor: 'TODOS' | TipoLedger; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'VENTA', texto: 'Ventas' },
  { valor: 'INGRESO', texto: 'Ingresos' },
  { valor: 'RETIRO', texto: 'Retiros' },
  { valor: 'APERTURA', texto: 'Apertura' },
]

function RegistroMovimientos({ turno, filas }: { turno: TurnoResumen; filas: FilaLedger[] }) {
  const [dialogoMov, setDialogoMov] = useState(false)
  const [filtro, setFiltro] = useState<'TODOS' | TipoLedger>('TODOS')

  const filasFiltradas = filtro === 'TODOS' ? filas : filas.filter((f) => f.tipo === filtro)

  return (
    <section className="rounded-xl border-l-2 border-primary bg-surface-high p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold uppercase tracking-wide">Registro de movimientos</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setDialogoMov(true)}>
            <Plus className="size-4" /> Movimiento
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => exportarCSV(filasFiltradas, turno.id_turno)}
          >
            <Download className="size-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Filtro por tipo */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {OPCIONES_FILTRO.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={filtro === o.valor}
            onClick={() => setFiltro(o.valor)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 ease-out-quart',
              filtro === o.valor
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-lowest text-muted-foreground hover:text-foreground',
            )}
          >
            {o.texto}
          </button>
        ))}
      </div>

      <div className="scrollbar-fina mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="micro-label py-2 pr-4 font-bold">Hora</th>
              <th className="micro-label py-2 pr-4 font-bold">Tipo</th>
              <th className="micro-label py-2 pr-4 font-bold">Descripcion</th>
              <th className="micro-label py-2 pr-4 font-bold">Usuario</th>
              <th className="micro-label py-2 pl-4 text-right font-bold">Monto</th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Sin movimientos de este tipo en el turno.
                </td>
              </tr>
            ) : (
              filasFiltradas.map((f) => (
                <tr key={f.clave} className="border-b border-border/40 last:border-0">
                  <td className="py-3 pr-4 tabular-nums text-muted-foreground">{horaCorta(f.hora)}</td>
                  <td className="py-3 pr-4">
                    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', ESTILO_TIPO[f.tipo])}>
                      {f.tipo}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{f.descripcion}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{f.usuario}</td>
                  <td
                    className={cn(
                      'py-3 pl-4 text-right font-semibold tabular-nums',
                      f.monto < 0 ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {f.monto < 0 ? '−' : '+'}
                    {formatearPrecio(Math.abs(f.monto))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MovimientoDialog abierto={dialogoMov} onCambiar={setDialogoMov} />
    </section>
  )
}

function MovimientoDialog({ abierto, onCambiar }: { abierto: boolean; onCambiar: (v: boolean) => void }) {
  const registrar = useRegistrarMovimiento()
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')

  const valor = Number(monto)
  const valido = monto !== '' && !Number.isNaN(valor) && valor > 0 && concepto.trim() !== ''

  function registrarMovimiento() {
    if (!valido) return
    registrar
      .mutateAsync({ tipo, monto: valor, concepto: concepto.trim() })
      .then(() => {
        toast.success(tipo === 'INGRESO' ? 'Ingreso registrado' : 'Egreso registrado')
        setMonto('')
        setConcepto('')
        onCambiar(false)
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase tracking-tight">Movimiento de caja</DialogTitle>
          <DialogDescription>Dinero que entra o sale sin estar ligado a una venta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipo('EGRESO')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
                tipo === 'EGRESO' ? 'bg-destructive/15 text-destructive' : 'bg-surface-lowest text-muted-foreground',
              )}
            >
              <ArrowUpRight className="size-4" /> Egreso
            </button>
            <button
              type="button"
              onClick={() => setTipo('INGRESO')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
                tipo === 'INGRESO' ? 'bg-primary/15 text-primary' : 'bg-surface-lowest text-muted-foreground',
              )}
            >
              <ArrowDownLeft className="size-4" /> Ingreso
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-monto">Monto</Label>
            <Input
              id="mov-monto"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-concepto">Concepto</Label>
            <Input
              id="mov-concepto"
              maxLength={150}
              placeholder="Ej. compra de hielo"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onCambiar(false)}>
            Cancelar
          </Button>
          <Button className="btn-heat gap-2" disabled={!valido || registrar.isPending} onClick={registrarMovimiento}>
            {registrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Abrir turno (sin turno activo) ----

export function AbrirTurnoForm() {
  const { data: cajas } = useQuery(cajasQuery)
  const abrir = useAbrirTurno()
  const [idCaja, setIdCaja] = useState<string>('')
  const [montoApertura, setMontoApertura] = useState('')

  const cajasLibres = (cajas ?? []).filter((c) => (c.turnos ?? []).length === 0)
  const monto = Number(montoApertura)
  const valido = idCaja !== '' && montoApertura !== '' && !Number.isNaN(monto) && monto >= 0

  function abrirTurno() {
    if (!valido) return
    abrir
      .mutateAsync({ idCaja: Number(idCaja), montoApertura: monto })
      .then(() => toast.success('Turno abierto'))
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border-b-2 border-primary bg-surface-high p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/15">
          <Wallet className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading text-lg font-semibold uppercase tracking-tight">Abrir turno</h2>
          <p className="text-xs text-muted-foreground">Necesario para cobrar y mover caja.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Caja</Label>
          <Select value={idCaja} onValueChange={setIdCaja}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elige una caja libre" />
            </SelectTrigger>
            <SelectContent>
              {(cajas ?? []).map((c) => {
                const ocupada = (c.turnos ?? []).length > 0
                return (
                  <SelectItem key={c.id_caja} value={String(c.id_caja)} disabled={ocupada}>
                    {c.nombre_caja}
                    {ocupada ? ' · en uso' : ''}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          {cajasLibres.length === 0 && (cajas ?? []).length > 0 && (
            <p className="text-xs text-destructive">Todas las cajas tienen un turno abierto.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monto-apertura">Base de efectivo</Label>
          <Input
            id="monto-apertura"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            placeholder="0"
            value={montoApertura}
            onChange={(e) => setMontoApertura(e.target.value)}
          />
        </div>

        <Button
          className="btn-heat h-11 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
          disabled={!valido || abrir.isPending}
          onClick={abrirTurno}
        >
          {abrir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          Abrir turno
        </Button>
      </div>
    </div>
  )
}
