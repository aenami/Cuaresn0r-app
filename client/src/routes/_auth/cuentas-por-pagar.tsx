import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Banknote, CheckCircle2, PackageCheck, Plus, Truck } from 'lucide-react'
import { toast } from 'sonner'
import {
  cuentasPorPagarQuery,
  proveedoresQuery,
  useCrearCuentaPorPagar,
  useCrearProveedor,
  usePagarCuentaPorPagar,
  useRecibirCuentaPorPagar,
} from '@/features/billing/cuentas-por-pagar-api'
import { ingredientesQuery } from '@/features/inventario/api'
import { useEsAdmin } from '@/stores/auth.store'
import type { CuentaPorPagar } from '@/types/api'
import { ApiError } from '@/lib/api'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const Route = createFileRoute('/_auth/cuentas-por-pagar')({ component: PaginaCuentasPorPagar })

function textoError(error: unknown) {
  return error instanceof ApiError ? error.message : 'Error de conexion'
}

function saldo(cuenta: CuentaPorPagar) {
  return Math.max(0, Number(cuenta.monto_total_cuentaPorPagar) - cuenta.pagos.reduce((total, pago) => total + Number(pago.monto_pagoCuentaPorPagar), 0))
}

function PaginaCuentasPorPagar() {
  const esAdmin = useEsAdmin()
  const { data: cuentas, isPending } = useQuery(cuentasPorPagarQuery)
  const [seleccionada, setSeleccionada] = useState<number | null>(null)
  const [crearAbierto, setCrearAbierto] = useState(false)
  const [proveedorAbierto, setProveedorAbierto] = useState(false)
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const recibir = useRecibirCuentaPorPagar()

  const lista = cuentas ?? []
  const actual = lista.find((cuenta) => cuenta.id_cuentaPorPagar === seleccionada) ?? lista[0]
  const pendientes = lista.filter((cuenta) => cuenta.estado_cuentaPorPagar === 'PENDIENTE' || cuenta.estado_cuentaPorPagar === 'PARCIAL')

  return (
    <div className="min-h-full p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="micro-label">Obligaciones del restaurante</p>
          <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tighter">Cuentas por pagar</h1>
          <p className="mt-2 text-sm text-muted-foreground">{pendientes.length} pendientes · saldo total {formatearPrecio(pendientes.reduce((total, cuenta) => total + saldo(cuenta), 0))}</p>
        </div>
        {esAdmin ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setProveedorAbierto(true)}><Truck className="size-4" /> Proveedor</Button>
            <Button className="btn-heat" onClick={() => setCrearAbierto(true)}><Plus className="size-4" /> Registrar cuenta</Button>
          </div>
        ) : null}
      </header>

      {isPending ? <p className="mt-8 text-sm text-muted-foreground">Cargando cuentas…</p> : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-2">
            {lista.map((cuenta) => (
              <button key={cuenta.id_cuentaPorPagar} type="button" onClick={() => setSeleccionada(cuenta.id_cuentaPorPagar)} className={cn('w-full rounded-xl border-l-4 bg-surface-high p-4 text-left transition-colors', actual?.id_cuentaPorPagar === cuenta.id_cuentaPorPagar ? 'border-primary' : 'border-border hover:border-tertiary')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-heading font-semibold">{cuenta.concepto_cuentaPorPagar}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{cuenta.proveedor.nombre_proveedor}{cuenta.documento_cuentaPorPagar ? ` · ${cuenta.documento_cuentaPorPagar}` : ''}</p></div>
                  <EstadoCuenta estado={cuenta.estado_cuentaPorPagar} />
                </div>
                <div className="mt-3 flex items-end justify-between"><span className="text-xs text-muted-foreground">Vence {cuenta.fecha_vencimiento_cuentaPorPagar ? new Date(cuenta.fecha_vencimiento_cuentaPorPagar).toLocaleDateString('es-CO') : 'sin fecha'}</span><span className="font-heading text-lg font-semibold tabular-nums text-primary">{formatearPrecio(saldo(cuenta))}</span></div>
              </button>
            ))}
            {lista.length === 0 ? <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p> : null}
          </div>

          {actual ? (
            <aside className="h-fit rounded-2xl bg-surface-low p-5 xl:sticky xl:top-6">
              <p className="micro-label">Detalle</p>
              <h2 className="mt-2 font-heading text-xl font-semibold">{actual.proveedor.nombre_proveedor}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{actual.concepto_cuentaPorPagar}</p>
              <div className="mt-5 space-y-2 border-y border-border py-4 text-sm">
                <div className="flex justify-between"><span>Total registrado</span><span>{formatearPrecio(actual.monto_total_cuentaPorPagar)}</span></div>
                <div className="flex justify-between font-semibold"><span>Saldo pendiente</span><span className="text-primary">{formatearPrecio(saldo(actual))}</span></div>
              </div>
              {actual.detalles.length > 0 ? <ul className="mt-4 space-y-1.5">{actual.detalles.map((detalle) => <li key={detalle.id_detalleCuentaPorPagar} className="flex justify-between text-xs"><span>{detalle.cantidad_detalleCuenta} × {detalle.ingrediente.nombre_ingrediente}</span><span>{formatearPrecio(Number(detalle.cantidad_detalleCuenta) * Number(detalle.precio_unitario_detalleCuenta))}</span></li>)}</ul> : null}
              <div className="mt-5 rounded-lg bg-surface-high p-3 text-xs"><span className={actual.fecha_recepcion_mercancia ? 'text-secondary' : 'text-tertiary'}>{actual.fecha_recepcion_mercancia ? 'Mercancia recibida e inventario actualizado' : 'Mercancia pendiente de confirmacion'}</span></div>
              {actual.estado_cuentaPorPagar !== 'PAGADA' && actual.estado_cuentaPorPagar !== 'ANULADA' ? <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="secondary" disabled={actual.fecha_recepcion_mercancia !== null || recibir.isPending} onClick={() => recibir.mutateAsync(actual.id_cuentaPorPagar).then(() => toast.success('Mercancia recibida; inventario actualizado')).catch((e: unknown) => toast.error(textoError(e)))}><PackageCheck className="size-4" /> Recibir</Button><Button className="btn-heat" onClick={() => setPagoAbierto(true)}><Banknote className="size-4" /> Pagar</Button></div> : null}
            </aside>
          ) : null}
        </div>
      )}

      <DialogProveedor abierto={proveedorAbierto} onCerrar={() => setProveedorAbierto(false)} />
      <DialogCuenta abierto={crearAbierto} onCerrar={() => setCrearAbierto(false)} />
      {actual ? <DialogPago abierto={pagoAbierto} cuenta={actual} onCerrar={() => setPagoAbierto(false)} /> : null}
    </div>
  )
}

function EstadoCuenta({ estado }: { estado: CuentaPorPagar['estado_cuentaPorPagar'] }) {
  const pagada = estado === 'PAGADA'
  return <Badge className={pagada ? 'bg-secondary text-secondary-foreground' : estado === 'ANULADA' ? 'bg-destructive/15 text-destructive' : 'bg-tertiary/15 text-tertiary'}>{estado}</Badge>
}

function DialogProveedor({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const crear = useCrearProveedor()
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  return <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}><DialogContent><DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle><DialogDescription>Datos basicos para asociar facturas y saldos.</DialogDescription></DialogHeader><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); crear.mutateAsync({ nombre, telefono: telefono || undefined }).then(() => { setNombre(''); setTelefono(''); onCerrar() }).catch((error: unknown) => toast.error(textoError(error))) }}><div><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></div><div><Label>Telefono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div><Button className="btn-heat w-full" disabled={crear.isPending}>Guardar proveedor</Button></form></DialogContent></Dialog>
}

function DialogCuenta({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { data: proveedores } = useQuery(proveedoresQuery)
  const { data: ingredientes } = useQuery(ingredientesQuery)
  const crear = useCrearCuentaPorPagar()
  const [idProveedor, setIdProveedor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [documento, setDocumento] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [monto, setMonto] = useState('')
  const [observacion, setObservacion] = useState('')
  const [lineas, setLineas] = useState<Array<{ idIngrediente: string; cantidad: string; precioUnitario: string }>>([])
  const agregarLinea = () => setLineas((actuales) => [...actuales, { idIngrediente: '', cantidad: '', precioUnitario: '' }])

  return <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Registrar cuenta por pagar</DialogTitle><DialogDescription>El inventario solo aumentara cuando caja confirme la recepcion.</DialogDescription></DialogHeader><form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); crear.mutateAsync({ idProveedor: Number(idProveedor), concepto, documento: documento || undefined, fechaVencimiento: vencimiento || undefined, montoTotal: Number(monto), observacion: observacion || undefined, detalles: lineas.filter((l) => l.idIngrediente).map((l) => ({ idIngrediente: Number(l.idIngrediente), cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) })) }).then(() => { toast.success('Cuenta registrada'); onCerrar() }).catch((error: unknown) => toast.error(textoError(error))) }}><div className="grid gap-3 sm:grid-cols-2"><div><Label>Proveedor</Label><Select value={idProveedor} onValueChange={setIdProveedor}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{(proveedores ?? []).filter((p) => p.proveedor_activo).map((p) => <SelectItem key={p.id_proveedor} value={String(p.id_proveedor)}>{p.nombre_proveedor}</SelectItem>)}</SelectContent></Select></div><div><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} required /></div><div><Label>Documento</Label><Input value={documento} onChange={(e) => setDocumento(e.target.value)} /></div><div><Label>Vencimiento</Label><Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></div><div><Label>Monto total</Label><Input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} required /></div></div><div><div className="mb-2 flex items-center justify-between"><Label>Mercancia / ingredientes (opcional)</Label><Button type="button" size="sm" variant="ghost" onClick={agregarLinea}><Plus className="size-3" /> Linea</Button></div>{lineas.map((linea, indice) => <div key={indice} className="mb-2 grid grid-cols-[1fr_7rem_8rem] gap-2"><Select value={linea.idIngrediente} onValueChange={(valor) => setLineas((actuales) => actuales.map((item, i) => i === indice ? { ...item, idIngrediente: valor } : item))}><SelectTrigger><SelectValue placeholder="Ingrediente" /></SelectTrigger><SelectContent>{(ingredientes ?? []).map((i) => <SelectItem key={i.id_ingrediente} value={String(i.id_ingrediente)}>{i.nombre_ingrediente}</SelectItem>)}</SelectContent></Select><Input type="number" step="any" placeholder="Cantidad" value={linea.cantidad} onChange={(e) => setLineas((actuales) => actuales.map((item, i) => i === indice ? { ...item, cantidad: e.target.value } : item))} /><Input type="number" step="any" placeholder="Costo unit." value={linea.precioUnitario} onChange={(e) => setLineas((actuales) => actuales.map((item, i) => i === indice ? { ...item, precioUnitario: e.target.value } : item))} /></div>)}</div><div><Label>Observacion</Label><Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} /></div><Button className="btn-heat w-full" disabled={crear.isPending || !idProveedor}>Registrar cuenta</Button></form></DialogContent></Dialog>
}

function DialogPago({ abierto, cuenta, onCerrar }: { abierto: boolean; cuenta: CuentaPorPagar; onCerrar: () => void }) {
  const pagar = usePagarCuentaPorPagar()
  const pendiente = useMemo(() => saldo(cuenta), [cuenta])
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO')
  const [monto, setMonto] = useState('')
  return <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}><DialogContent><DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>Saldo actual {formatearPrecio(pendiente)}. Las transferencias se concilian aparte del efectivo fisico.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button type="button" variant={metodo === 'EFECTIVO' ? 'default' : 'outline'} onClick={() => setMetodo('EFECTIVO')}>Efectivo</Button><Button type="button" variant={metodo === 'TRANSFERENCIA' ? 'default' : 'outline'} onClick={() => setMetodo('TRANSFERENCIA')}>Transferencia</Button></div><div><Label>Monto</Label><Input type="number" min={1} max={pendiente} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={String(pendiente)} /></div><Button className="btn-heat w-full" disabled={pagar.isPending} onClick={() => pagar.mutateAsync({ id: cuenta.id_cuentaPorPagar, metodo, monto: monto ? Number(monto) : pendiente }).then(() => { toast.success('Pago registrado'); setMonto(''); onCerrar() }).catch((error: unknown) => toast.error(textoError(error)))}><CheckCircle2 className="size-4" /> Confirmar pago</Button></DialogContent></Dialog>
}
