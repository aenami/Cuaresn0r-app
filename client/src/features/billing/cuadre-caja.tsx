import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Coins,
  History,
  Landmark,
  Loader2,
  Lock,
  ReceiptText,
  Smartphone,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import type {
  FacturaPendienteCuadre,
  PagoNominaCuadre,
  PagoProveedorCuadre,
  Turno,
  TurnoResumen,
  TipoTurno,
} from '@/types/api'
import { estadoConteoCierreQuery, turnoQuery, turnosQuery, useCerrarTurno } from '@/features/billing/api'
import { SelectorTipoTurno } from './tipo-turno'
import { nombresTurno } from './tipos-turno'
import { Link } from '@tanstack/react-router'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorApi, horaCorta } from './caja-comun'

const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000]
const MONEDAS = [1000, 500, 200, 100, 50]

function fechaLarga(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fechaCorta(fecha: string | null) {
  if (!fecha) return 'Sin vencimiento'
  return new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resultadoCuadre(diferencia: number) {
  if (diferencia === 0) return { texto: 'Caja exacta', estilo: 'text-primary', fondo: 'border-primary/30 bg-primary/10' }
  if (diferencia > 0) return { texto: 'Sobrante', estilo: 'text-tertiary', fondo: 'border-tertiary/30 bg-tertiary/10' }
  return { texto: 'Faltante', estilo: 'text-destructive', fondo: 'border-destructive/30 bg-destructive/10' }
}

export function CuadreCaja({ turno }: { turno: TurnoResumen | null }) {
  return turno ? <CuadreActivo turno={turno} /> : <HistorialCuadres />
}

function CuadreActivo({ turno }: { turno: TurnoResumen }) {
  const cerrar = useCerrarTurno(turno.id_turno)
  const [conteo, setConteo] = useState<Record<number, string>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [tipoAnterior, setTipoAnterior] = useState<TipoTurno | ''>('')
  const tipo = turno.tipo_turno ?? tipoAnterior
  const exigeInventario = tipo === 'TARDE_NOCHE' || tipo === 'UNICO'
  const inventario = useQuery({ ...estadoConteoCierreQuery(turno.id_turno), enabled: exigeInventario })
  const bloqueoInventario = !tipo || (exigeInventario && (!inventario.data?.completo || inventario.isError))

  const denominaciones = [...BILLETES, ...MONEDAS]
  const totalContado = denominaciones.reduce(
    (total, denominacion) => total + denominacion * (parseInt(conteo[denominacion] || '0', 10) || 0),
    0,
  )
  const tieneConteo = Object.values(conteo).some((cantidad) => Number(cantidad) > 0)
  const esperado = Number(turno.resumenCuadre.efectivo.esperadoConBase)
  const base = Number(turno.baseCaja)
  const diferencia = totalContado - esperado

  function confirmarCierre() {
    if (bloqueoInventario || !tipo) return
    const conteoNumerico = Object.fromEntries(
      denominaciones
        .map((denominacion) => [denominacion, parseInt(conteo[denominacion] || '0', 10) || 0] as const)
        .filter(([, cantidad]) => cantidad > 0),
    )
    cerrar
      .mutateAsync({ montoCierreReal: totalContado, conteo: conteoNumerico, ...(!turno.tipo_turno && { tipo }) })
      .then(() => {
        setConfirmando(false)
        const estado = resultadoCuadre(diferencia)
        toast.success(`Cuadre guardado · ${estado.texto}: ${formatearPrecio(Math.abs(diferencia))}`)
      })
      .catch((error: unknown) => toast.error(errorApi(error)))
  }

  return (
    <div className="space-y-7">
      <EncabezadoCuadre turno={turno} historico={false} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InformeCuadre turno={turno} />

        <aside className="space-y-4 xl:sticky xl:top-6">
          {!turno.tipo_turno ? <SelectorTipoTurno valor={tipoAnterior} onCambiar={setTipoAnterior} /> : null}
          {exigeInventario ? <div className="rounded-lg bg-surface-high p-4 text-sm" role="status">
            <p className="font-semibold">Conteo diario de inventario</p>
            {inventario.isPending ? <p>Verificando conteo…</p> : inventario.isError ? <>
              <p className="text-destructive">No se pudo verificar el conteo. El cierre sigue bloqueado.</p>
              <Button variant="ghost" onClick={() => void inventario.refetch()}>Reintentar</Button>
            </> : inventario.data ? <>
              <p className="mt-1">Fecha: {inventario.data.fecha}</p>
              <p className={inventario.data.completo ? 'text-emerald-300' : 'text-tertiary'}>
                {inventario.data.completo ? 'Conteo completo. Puedes cerrar caja.' : inventario.data.total === 0
                  ? 'Configura la lista fija y completa el conteo antes de cerrar.'
                  : `Elementos por contar o verificar: ${inventario.data.faltantes.length + inventario.data.pendientes.length + inventario.data.recontar.length}.`}
              </p>
              {inventario.data.recontar.length > 0 ? <p>Hubo entregas después del conteo. Solicita al administrador reabrir esos elementos.</p> : null}
              {inventario.data.inconsistencias > 0 ? <p className="text-tertiary">{inventario.data.inconsistencias} diferencias registradas. No bloquean el cierre.</p> : null}
            </> : null}
            <Link to="/inventario" className="mt-2 inline-block text-primary underline underline-offset-4">Ir a inventario → Conteo diario</Link>
          </div> : null}
          <ConteoEfectivo conteo={conteo} onCambiar={setConteo} />
          <TarjetaResultado
            base={base}
            contado={totalContado}
            esperado={esperado}
            mostrarResultado={tieneConteo}
          />
          <Button
            className="btn-heat h-12 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
            disabled={!tieneConteo || cerrar.isPending || bloqueoInventario}
            onClick={() => setConfirmando(true)}
          >
            {cerrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Confirmar cuadre y cerrar
          </Button>
          {!tieneConteo ? (
            <p className="text-center text-xs text-muted-foreground">Cuenta primero los billetes y monedas de la caja.</p>
          ) : null}
        </aside>
      </div>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-tight">Confirmar cuadre del turno</DialogTitle>
            <DialogDescription>
              Se cerrará el turno y se congelará este formato, incluidas las facturas pendientes informativas.
            </DialogDescription>
          </DialogHeader>
          <TarjetaResultado base={base} contado={totalContado} esperado={esperado} mostrarResultado />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button
              variant="outline"
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={cerrar.isPending || bloqueoInventario}
              onClick={confirmarCierre}
            >
              {cerrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Cerrar turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EncabezadoCuadre({ turno, historico }: { turno: TurnoResumen; historico: boolean }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-surface-high p-6 md:p-8">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full border-[28px] border-primary/5" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className={cn('size-2 rounded-full', historico ? 'bg-muted-foreground' : 'animate-pulse bg-primary')} />
            <span className="micro-label">{historico ? 'Cuadre cerrado' : 'Formato en vivo'}</span>
          </div>
          <h1 className="font-heading text-4xl font-semibold uppercase tracking-tight md:text-5xl">
            Cuadre<span className="text-primary">_</span>Caja
          </h1>
          <p className="mt-2 text-sm text-muted-foreground first-letter:uppercase">
            {fechaLarga(turno.fecha_apertura_turno)} · Turno #{turno.id_turno}
            {' · '}{turno.tipo_turno ? nombresTurno[turno.tipo_turno] : 'Sin clasificación (anterior)'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-lowest/70 px-4 py-3 text-right">
          <p className="micro-label">Responsable</p>
          <p className="mt-1 text-sm font-medium">{turno.usuario?.email_usuario ?? `Usuario #${turno.id_usuario_turno}`}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {turno.caja?.nombre_caja} · {horaCorta(turno.fecha_apertura_turno)}
            {turno.fecha_cierre_turno ? ` — ${horaCorta(turno.fecha_cierre_turno)}` : ' — activo'}
          </p>
        </div>
      </div>
    </header>
  )
}

function InformeCuadre({ turno }: { turno: TurnoResumen }) {
  const resumen = turno.resumenCuadre
  const ventaTotal = Number(resumen.ventas.total)
  const ventaNequi = Number(resumen.ventas.transferencia)
  const esperadoConBase = Number(resumen.efectivo.esperadoConBase)
  const esperadoSinBase = Number(resumen.efectivo.esperadoSinBase)
  const egresosDigitales =
    Number(resumen.egresos.nominaTransferencia) + Number(resumen.egresos.cuentasTransferencia)

  return (
    <main className="min-w-0 space-y-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <Metrica
          icono={ReceiptText}
          etiqueta="Venta del turno"
          valor={ventaTotal}
          detalle={`Efectivo ${formatearPrecio(resumen.ventas.efectivo)} · Tarjeta ${formatearPrecio(resumen.ventas.tarjeta)}`}
          acento="border-primary/40"
        />
        <Metrica
          icono={Smartphone}
          etiqueta="Recibido por Nequi"
          valor={ventaNequi}
          detalle={`Saldo digital neto: ${formatearPrecio(resumen.netoTransferencias)}`}
          acento="border-tertiary/40"
        />
        <Metrica
          icono={Banknote}
          etiqueta="Efectivo esperado con base"
          valor={esperadoConBase}
          detalle={`Incluye base fija de ${formatearPrecio(turno.baseCaja)}`}
          acento="border-secondary/40"
        />
        <Metrica
          icono={Landmark}
          etiqueta="Efectivo esperado sin base"
          valor={esperadoSinBase}
          detalle="Disponible después de reservar la base"
          acento="border-border"
        />
      </section>

      <section className="rounded-xl border border-border bg-surface-high p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="micro-label">Conciliación digital</p>
            <h2 className="mt-1 font-heading text-lg font-semibold uppercase tracking-wide">Nequi separado del cajón</h2>
          </div>
          <Smartphone className="size-5 text-tertiary" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Dato etiqueta="Ingresos por ventas" valor={ventaNequi} />
          <Dato etiqueta="Pagos digitales" valor={-egresosDigitales} />
          <Dato etiqueta="Saldo digital neto" valor={Number(resumen.netoTransferencias)} destacado />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Este saldo se concilia por separado y nunca aumenta el efectivo físico esperado en caja.
        </p>
      </section>

      <TablaNomina pagos={turno.detallePagosNomina} />
      {turno.conteo_inventario_cierre_turno ? <section className="rounded-lg bg-surface-high p-4 text-sm">
        <h2 className="font-semibold">Inventario verificado al cerrar</h2>
        <p className="mt-1">{turno.conteo_inventario_cierre_turno.fecha} · {turno.conteo_inventario_cierre_turno.total} elementos contados · {turno.conteo_inventario_cierre_turno.inconsistencias} diferencias registradas.</p>
      </section> : null}
      <TablaProveedores pagos={turno.detallePagosProveedores} />
      <FacturasPendientes
        cuentas={resumen.facturasPendientes.cuentas}
        total={Number(resumen.facturasPendientes.total)}
        historicoDisponible={resumen.facturasPendientes.historicoDisponible}
      />
    </main>
  )
}

function Metrica({
  icono: Icono,
  etiqueta,
  valor,
  detalle,
  acento,
}: {
  icono: typeof ReceiptText
  etiqueta: string
  valor: number
  detalle: string
  acento: string
}) {
  return (
    <article className={cn('rounded-xl border bg-surface-high p-4', acento)}>
      <div className="flex items-center justify-between gap-3">
        <p className="micro-label">{etiqueta}</p>
        <Icono className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-3 font-heading text-2xl font-semibold tabular-nums">{formatearPrecio(valor)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </article>
  )
}

function Dato({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: number; destacado?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-surface-lowest p-3', destacado && 'ring-1 ring-tertiary/30')}>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={cn('mt-1 font-heading font-semibold tabular-nums', destacado && 'text-tertiary')}>
        {valor < 0 ? '−' : ''}{formatearPrecio(Math.abs(valor))}
      </p>
    </div>
  )
}

function TituloSeccion({ icono: Icono, titulo, total }: { icono: typeof UserRound; titulo: string; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex items-center gap-2">
        <Icono className="size-4 text-primary" />
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide">{titulo}</h2>
      </div>
      <span className="font-heading text-sm font-semibold tabular-nums">{formatearPrecio(total)}</span>
    </div>
  )
}

function TablaNomina({ pagos }: { pagos: PagoNominaCuadre[] }) {
  const total = pagos.reduce((suma, pago) => suma + Number(pago.monto), 0)
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface-high">
      <TituloSeccion icono={UserRound} titulo="Pagos a empleados" total={total} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead><tr className="bg-surface-lowest text-left">
            <th className="micro-label px-5 py-2.5">Empleado</th>
            <th className="micro-label px-3 py-2.5">Concepto</th>
            <th className="micro-label px-3 py-2.5">Medio</th>
            <th className="micro-label px-5 py-2.5 text-right">Valor pagado</th>
          </tr></thead>
          <tbody>
            {pagos.length === 0 ? <FilaVacia texto="No hubo pagos a empleados en este turno." /> : pagos.map((pago) => (
              <tr key={pago.id} className="border-t border-border/60">
                <td className="px-5 py-3 font-medium">{pago.empleado}</td>
                <td className="px-3 py-3 text-muted-foreground">{pago.concepto}</td>
                <td className="px-3 py-3"><MedioPago metodo={pago.metodo} /></td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatearPrecio(pago.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TablaProveedores({ pagos }: { pagos: PagoProveedorCuadre[] }) {
  const total = pagos.reduce((suma, pago) => suma + Number(pago.monto), 0)
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface-high">
      <TituloSeccion icono={Landmark} titulo="Pagos a proveedores" total={total} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead><tr className="bg-surface-lowest text-left">
            <th className="micro-label px-5 py-2.5">Proveedor</th>
            <th className="micro-label px-3 py-2.5">Concepto</th>
            <th className="micro-label px-3 py-2.5">Medio</th>
            <th className="micro-label px-5 py-2.5 text-right">Valor pagado</th>
          </tr></thead>
          <tbody>
            {pagos.length === 0 ? <FilaVacia texto="No hubo pagos a proveedores en este turno." /> : pagos.map((pago) => (
              <tr key={pago.id} className="border-t border-border/60">
                <td className="px-5 py-3 font-medium">{pago.proveedor}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {pago.concepto}{pago.documento ? <span className="block text-[11px]">Doc. {pago.documento}</span> : null}
                </td>
                <td className="px-3 py-3"><MedioPago metodo={pago.metodo} /></td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatearPrecio(pago.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MedioPago({ metodo }: { metodo: 'EFECTIVO' | 'TRANSFERENCIA' }) {
  return (
    <span className={cn(
      'inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
      metodo === 'TRANSFERENCIA'
        ? 'border-tertiary/30 bg-tertiary/10 text-tertiary'
        : 'border-primary/30 bg-primary/10 text-primary',
    )}>
      {metodo === 'TRANSFERENCIA' ? 'Nequi' : 'Efectivo'}
    </span>
  )
}

function FilaVacia({ texto }: { texto: string }) {
  return <tr><td colSpan={4} className="px-5 py-7 text-center text-sm text-muted-foreground">{texto}</td></tr>
}

function FacturasPendientes({
  cuentas,
  total,
  historicoDisponible,
}: {
  cuentas: FacturaPendienteCuadre[]
  total: number
  historicoDisponible: boolean
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/25 bg-surface-high">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-amber-500" />
          <div>
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide">Facturas pendientes por pagar</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Informativas: no disminuyen el efectivo hasta ser pagadas.</p>
          </div>
        </div>
        <span className="font-heading text-sm font-semibold tabular-nums text-amber-500">{formatearPrecio(total)}</span>
      </div>
      {!historicoDisponible ? (
        <p className="px-5 py-7 text-center text-sm text-muted-foreground">
          Este turno se cerró antes de habilitar la fotografía histórica de facturas pendientes.
        </p>
      ) : cuentas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-5 py-7 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" /> No había facturas pendientes.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {cuentas.map((cuenta) => (
            <div key={cuenta.idCuenta} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-medium">{cuenta.proveedor} · {cuenta.concepto}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cuenta.documento ? `Doc. ${cuenta.documento} · ` : ''}Vence: {fechaCorta(cuenta.fechaVencimiento)}
                </p>
              </div>
              <p className="font-semibold tabular-nums text-amber-500">{formatearPrecio(cuenta.saldoPendiente)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ConteoEfectivo({
  conteo,
  onCambiar,
}: {
  conteo: Record<number, string>
  onCambiar: (conteo: Record<number, string>) => void
}) {
  return (
    <section className="rounded-xl border-l-2 border-primary bg-surface-high p-5">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-primary" />
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide">Conteo físico</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Incluye los $300.000 de base.</p>

      <p className="micro-label mt-5">Billetes</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {BILLETES.map((valor) => (
          <CampoDenominacion
            key={valor}
            valor={valor}
            cantidad={conteo[valor] ?? ''}
            onCambiar={(cantidad) => onCambiar({ ...conteo, [valor]: cantidad })}
          />
        ))}
      </div>

      <p className="micro-label mt-5">Monedas</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {MONEDAS.map((valor) => (
          <CampoDenominacion
            key={valor}
            valor={valor}
            cantidad={conteo[valor] ?? ''}
            onCambiar={(cantidad) => onCambiar({ ...conteo, [valor]: cantidad })}
          />
        ))}
      </div>
    </section>
  )
}

function CampoDenominacion({ valor, cantidad, onCambiar }: { valor: number; cantidad: string; onCambiar: (v: string) => void }) {
  return (
    <label className="rounded-lg bg-surface-lowest p-2">
      <span className="micro-label block">{formatearPrecio(valor)}</span>
      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder="0"
        value={cantidad}
        onChange={(event) => onCambiar(event.target.value)}
        className="mt-1 h-8 border-0 bg-transparent px-1 text-center tabular-nums shadow-none"
      />
    </label>
  )
}

function TarjetaResultado({
  base,
  contado,
  esperado,
  mostrarResultado,
}: {
  base: number
  contado: number
  esperado: number
  mostrarResultado: boolean
}) {
  const diferencia = contado - esperado
  const estado = resultadoCuadre(diferencia)
  return (
    <section className={cn('rounded-xl border bg-surface-high p-5', mostrarResultado ? estado.fondo : 'border-border')}>
      <p className="micro-label">Resultado del cuadre</p>
      <div className="mt-4 space-y-2 text-sm">
        <FilaCalculo etiqueta="Esperado con base" valor={esperado} />
        <FilaCalculo etiqueta="Contado con base" valor={contado} />
        <FilaCalculo etiqueta="Esperado sin base" valor={esperado - base} secundario />
        <FilaCalculo etiqueta="Contado sin base" valor={contado - base} secundario />
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-end justify-between gap-3">
          <span className={cn('font-heading text-sm font-semibold uppercase', mostrarResultado ? estado.estilo : 'text-muted-foreground')}>
            {mostrarResultado ? estado.texto : 'Pendiente de conteo'}
          </span>
          <span className={cn('font-heading text-xl font-semibold tabular-nums', mostrarResultado ? estado.estilo : 'text-muted-foreground')}>
            {mostrarResultado ? formatearPrecio(Math.abs(diferencia)) : '—'}
          </span>
        </div>
      </div>
    </section>
  )
}

function FilaCalculo({ etiqueta, valor, secundario = false }: { etiqueta: string; valor: number; secundario?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', secundario && 'text-muted-foreground')}>
      <span>{etiqueta}</span>
      <span className="font-medium tabular-nums">{formatearPrecio(valor)}</span>
    </div>
  )
}

function HistorialCuadres() {
  const { data: turnos, isPending } = useQuery(turnosQuery('CERRADO'))
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const idSeleccionado = seleccionado ?? turnos?.[0]?.id_turno ?? 0
  const { data: detalle, isPending: cargandoDetalle } = useQuery({
    ...turnoQuery(idSeleccionado),
    enabled: idSeleccionado > 0,
  })

  if (isPending) return <div className="h-80 animate-pulse rounded-2xl bg-surface-high" />

  if (!turnos?.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border bg-surface-high p-8 text-center">
        <div>
          <History className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 font-heading text-xl font-semibold uppercase">Sin cuadres cerrados</h1>
          <p className="mt-1 text-sm text-muted-foreground">Abre un turno y completa su conteo para crear el primer cuadre.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="micro-label">Archivo de caja</p>
        <h1 className="mt-1 font-heading text-4xl font-semibold uppercase tracking-tight">Historial de cuadres</h1>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="space-y-2 lg:sticky lg:top-6">
          {turnos.map((turno) => (
            <BotonTurno
              key={turno.id_turno}
              turno={turno}
              activo={turno.id_turno === idSeleccionado}
              onSeleccionar={() => setSeleccionado(turno.id_turno)}
            />
          ))}
        </div>
        {cargandoDetalle || !detalle ? (
          <div className="h-96 animate-pulse rounded-2xl bg-surface-high" />
        ) : (
          <div className="space-y-6">
            <EncabezadoCuadre turno={detalle} historico />
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <InformeCuadre turno={detalle} />
              <TarjetaResultado
                base={Number(detalle.baseCaja)}
                contado={Number(detalle.resumenCuadre.efectivo.realConBase ?? 0)}
                esperado={Number(detalle.resumenCuadre.efectivo.esperadoConBase)}
                mostrarResultado={detalle.resumenCuadre.efectivo.realConBase !== null}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BotonTurno({ turno, activo, onSeleccionar }: { turno: Turno; activo: boolean; onSeleccionar: () => void }) {
  const esperado = Number(turno.monto_cierre_esperado ?? 0)
  const real = Number(turno.monto_cierre_real_turno ?? 0)
  const diferencia = real - esperado
  const estado = resultadoCuadre(diferencia)
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-colors duration-150',
        activo ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface-high hover:bg-surface-low',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">Turno #{turno.id_turno}</span>
        <ChevronRight className={cn('size-4 transition-transform', activo && 'translate-x-0.5 text-primary')} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium">
        <CalendarClock className="size-3.5 text-muted-foreground" />
        {new Date(turno.fecha_apertura_turno).toLocaleDateString('es-CO')}
      </p>
      <p className={cn('mt-1 text-xs font-medium', estado.estilo)}>
        {estado.texto} · {formatearPrecio(Math.abs(diferencia))}
      </p>
    </button>
  )
}
