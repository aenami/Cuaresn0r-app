import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import type { TipoTurno, Turno, TurnoResumen } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectorTipoTurno } from '@/features/billing/tipo-turno'
import { errorApi } from '@/features/billing/caja-comun'
import { formatearPrecio } from '@/lib/formato'
import { bakeryApi, bakeryKeys, cajasPanaderiaQuery, conteoQuery, historialPanaderiaQuery } from './api'

export function CajaPanaderia({ turno, cargando, esAdmin, onIrInventario }: { turno: TurnoResumen | null; cargando: boolean; esAdmin: boolean; onIrInventario: () => void }) {
  const queryClient = useQueryClient()
  const { data: cajas, isPending: cajasCargando } = useQuery(cajasPanaderiaQuery)
  const { data: inventario, isPending: inventarioCargando } = useQuery(conteoQuery)
  const { data: historial } = useQuery(historialPanaderiaQuery)
  const [cajaId, setCajaId] = useState('')
  const [tipo, setTipo] = useState<TipoTurno | ''>('')
  const [nombreCaja, setNombreCaja] = useState('Caja panaderia')
  const [efectivoReal, setEfectivoReal] = useState('')
  const [movTipo, setMovTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [movMonto, setMovMonto] = useState('')
  const [movConcepto, setMovConcepto] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setGuardando(true)
    try {
      await accion()
      toast.success(exito)
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  if (cargando || cajasCargando) return <div className="h-72 animate-pulse rounded-lg bg-surface-high" />
  if (!turno) return <div className="space-y-8"><section className="mx-auto max-w-lg space-y-5 rounded-xl bg-surface-high p-6">
    <div className="flex items-center gap-2"><Wallet className="size-5 text-primary" /><h2 className="font-heading text-xl font-semibold uppercase">Abrir caja de panaderia</h2></div>
    {(cajas ?? []).length === 0 ? esAdmin ? <div className="space-y-2"><Label htmlFor="pan-nombre-caja">Nombre de la caja</Label><div className="flex gap-2"><Input id="pan-nombre-caja" maxLength={30} value={nombreCaja} onChange={(e) => setNombreCaja(e.target.value)} /><Button disabled={guardando || !nombreCaja.trim()} onClick={() => void ejecutar(() => bakeryApi.crearCaja(nombreCaja.trim()), 'Caja creada')}>Crear</Button></div></div>
      : <p className="text-sm text-tertiary">Un administrador debe crear la caja de panaderia.</p>
      : <div><Label htmlFor="pan-caja">Caja</Label><Select value={cajaId} onValueChange={setCajaId}><SelectTrigger id="pan-caja"><SelectValue placeholder="Selecciona una caja" /></SelectTrigger><SelectContent>{cajas?.map((caja) => <SelectItem key={caja.id_caja} value={String(caja.id_caja)} disabled={caja.turnos.length > 0}>{caja.nombre_caja}{caja.turnos.length ? ' · ocupada' : ''}</SelectItem>)}</SelectContent></Select></div>}
    <SelectorTipoTurno valor={tipo} onCambiar={setTipo} />
    <p className="rounded-lg bg-surface-low p-3 text-sm">Base de caja al abrir: <strong>{formatearPrecio(300_000)}</strong></p>
    <Button className="btn-heat w-full" disabled={!cajaId || !tipo || guardando} onClick={() => void ejecutar(() => bakeryApi.abrirTurno(Number(cajaId), tipo as TipoTurno), 'Turno abierto')}>Abrir turno</Button>
  </section><HistorialPanaderia turnos={historial ?? []} /></div>

  const necesitaConteo = turno.tipo_turno !== 'MANANA'
  const puedeCerrar = !necesitaConteo || (!inventarioCargando && inventario?.completo === true)
  const efectivoEsperado = Number(turno.resumenCuadre.efectivo.esperadoConBase)
  const diferenciaValorada = Number(inventario?.valorDiferencia ?? 0)
  const efectivoFisico = Number(efectivoReal)

  return <div className="space-y-6">
    <div><h2 className="font-heading text-xl font-semibold uppercase">Cuadre del turno #{turno.id_turno}</h2><p className="mt-1 text-sm text-muted-foreground">{turno.caja?.nombre_caja} · {turno.tipo_turno?.replace('_', ' ')}</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-surface-high p-4"><p className="text-xs text-muted-foreground">Ventas registradas</p><strong className="mt-2 block font-heading text-xl tabular-nums">{formatearPrecio(turno.resumenCuadre.ventas.total)}</strong><p className="mt-1 text-xs text-muted-foreground">Todos los medios de pago</p></div>
      <div className="rounded-lg bg-surface-high p-4"><p className="text-xs text-muted-foreground">Efectivo esperado con base</p><strong className="mt-2 block font-heading text-xl tabular-nums">{formatearPrecio(efectivoEsperado)}</strong><p className="mt-1 text-xs text-muted-foreground">Segun cobros y movimientos registrados</p></div>
      <div className="rounded-lg bg-surface-high p-4"><p className="text-xs text-muted-foreground">Valor por explicar en inventario</p><strong className={`mt-2 block font-heading text-xl tabular-nums ${diferenciaValorada > 0 ? 'text-tertiary' : 'text-foreground'}`}>{formatearPrecio(diferenciaValorada)}</strong><p className="mt-1 text-xs text-muted-foreground">Estimacion; no figura como dinero cobrado</p></div>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-lg bg-surface-high p-5">
        <h3 className="font-heading text-base font-semibold uppercase">Movimientos de caja</h3>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="pan-mov-tipo">Tipo</Label><Select value={movTipo} onValueChange={(valor) => setMovTipo(valor as 'INGRESO' | 'EGRESO')}><SelectTrigger id="pan-mov-tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INGRESO">Ingreso</SelectItem><SelectItem value="EGRESO">Egreso</SelectItem></SelectContent></Select></div><div><Label htmlFor="pan-mov-monto">Monto COP</Label><Input id="pan-mov-monto" type="number" min="1" inputMode="numeric" value={movMonto} onChange={(e) => setMovMonto(e.target.value)} /></div></div>
        <div><Label htmlFor="pan-mov-concepto">Concepto</Label><Input id="pan-mov-concepto" value={movConcepto} maxLength={150} onChange={(e) => setMovConcepto(e.target.value)} placeholder="Ej. pago a empleado" /></div>
        <Button variant="secondary" disabled={guardando || !Number.isInteger(Number(movMonto)) || Number(movMonto) <= 0 || !movConcepto.trim()} onClick={() => void ejecutar(async () => { await bakeryApi.movimientoCaja({ tipo: movTipo, monto: Number(movMonto), concepto: movConcepto.trim() }); setMovMonto(''); setMovConcepto('') }, 'Movimiento registrado')}>Registrar movimiento</Button>
        <div className="border-t border-border pt-3 text-sm">{turno.movimientosCaja.length === 0 ? <p className="text-muted-foreground">Sin ingresos ni egresos adicionales.</p> : turno.movimientosCaja.map((m) => <div key={m.id_mc} className="flex justify-between gap-2 py-1"><span>{m.concepto_mc}</span><strong className="shrink-0 tabular-nums">{m.tipo_mc === 'EGRESO' ? '−' : '+'}{formatearPrecio(m.monto_mc)}</strong></div>)}</div>
      </section>
      <section className="space-y-4 rounded-lg bg-surface-high p-5">
        <h3 className="font-heading text-base font-semibold uppercase">Cierre</h3>
        {necesitaConteo && <div className="rounded-lg bg-surface-low p-3 text-sm">{inventarioCargando ? 'Comprobando conteo…' : inventario?.completo ? 'Conteo fisico completo.' : `Faltan ${inventario?.faltantes.length ?? '—'} articulos por contar y ${inventario?.recontar.length ?? 0} por recontar.`}{!inventario?.completo && <Button size="sm" variant="secondary" className="mt-2 block" onClick={onIrInventario}>Ir al conteo</Button>}</div>}
        {diferenciaValorada > 0 && <p className="rounded-lg bg-tertiary/10 p-3 text-sm text-tertiary">El inventario sugiere {formatearPrecio(diferenciaValorada)} de productos salidos sin venta registrada. Si fue efectivo, el dinero fisico podria llegar a {formatearPrecio(efectivoEsperado + diferenciaValorada)}. Revisa la causa; el sistema no registra ese ingreso automaticamente.</p>}
        <div><Label htmlFor="pan-cierre-real">Efectivo contado con base de caja</Label><Input id="pan-cierre-real" type="number" min="0" step="1" inputMode="numeric" value={efectivoReal} onChange={(e) => setEfectivoReal(e.target.value)} /></div>
        {efectivoReal !== '' && <p className="text-sm">Diferencia frente a cobros registrados: <strong className={efectivoFisico - efectivoEsperado < 0 ? 'text-destructive' : 'text-emerald-400'}>{formatearPrecio(efectivoFisico - efectivoEsperado)}</strong></p>}
        <Button className="btn-heat" disabled={guardando || !puedeCerrar || efectivoReal === '' || !Number.isFinite(efectivoFisico) || efectivoFisico < 0} onClick={() => void ejecutar(async () => { await bakeryApi.cerrarTurno(turno.id_turno, efectivoFisico); setEfectivoReal('') }, 'Turno cerrado')}>Confirmar cierre</Button>
      </section>
    </div>
    <HistorialPanaderia turnos={historial ?? []} />
  </div>
}

function HistorialPanaderia({ turnos }: { turnos: Turno[] }) {
  return <section className="space-y-3" aria-labelledby="pan-historial">
    <h2 id="pan-historial" className="font-heading text-lg font-semibold uppercase">Ultimos cierres de panaderia</h2>
    {turnos.length === 0 ? <p className="text-sm text-muted-foreground">Todavia no hay cierres registrados.</p>
      : <div className="space-y-2">{turnos.slice(0, 10).map((t) => {
        const diferencia = Number(t.monto_cierre_real_turno ?? 0) - Number(t.monto_cierre_esperado ?? 0)
        return <div key={t.id_turno} className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface-high p-3 text-sm"><span>Turno #{t.id_turno} · {new Date(t.fecha_cierre_turno ?? t.fecha_apertura_turno).toLocaleString('es-CO')} · {t.tipo_turno?.replace('_', ' ')}</span><span className="tabular-nums">Caja: {formatearPrecio(diferencia)} · Inventario: {formatearPrecio(t.conteo_panaderia_cierre_turno?.valorDiferencia ?? 0)}</span></div>
      })}</div>}
  </section>
}
