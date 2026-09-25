import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatearPrecio } from '@/lib/formato'
import { errorApi } from '@/features/billing/caja-comun'
import { ingredientesQuery } from '@/features/inventario/api'
import { articulosQuery, bakeryApi, bakeryKeys, transferenciasQuery, transferenciasRestauranteQuery } from './api'

export function TrasladosRestaurante({ esAdmin }: { esAdmin: boolean }) {
  const queryClient = useQueryClient()
  const { data: ingredientes } = useQuery({ ...ingredientesQuery, enabled: esAdmin })
  const { data: articulos } = useQuery({ ...articulosQuery, enabled: esAdmin })
  const { data: salidas, isPending, isError } = useQuery(transferenciasRestauranteQuery)
  const { data: entradas } = useQuery(transferenciasQuery)
  const [ingredienteId, setIngredienteId] = useState('')
  const [articuloId, setArticuloId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [concepto, setConcepto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmacion, setConfirmacion] = useState<number | null>(null)
  const pendiente = useRef<{ firma: string; clave: string } | null>(null)
  const ingrediente = ingredientes?.find((i) => i.id_ingrediente === Number(ingredienteId))
  const monto = Number(cantidad) * Number(precio)
  const valido = ingredienteId && articuloId && Number.isFinite(Number(cantidad)) && Number(cantidad) > 0
    && (ingrediente?.unidades_ingrediente !== 'UNIDADES' || Number.isInteger(Number(cantidad)))
    && Number.isInteger(Number(precio)) && Number(precio) > 0 && Number.isInteger(monto) && concepto.trim()

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setGuardando(true)
    try { await accion(); toast.success(mensaje); await queryClient.invalidateQueries({ queryKey: bakeryKeys.all }); return true }
    catch (error) { toast.error(errorApi(error)); return false }
    finally { setGuardando(false) }
  }

  async function crear() {
    const datos = { ingredienteId: Number(ingredienteId), articuloDestinoId: Number(articuloId), cantidad: Number(cantidad), precioUnitario: Number(precio), concepto: concepto.trim() }
    const firma = JSON.stringify(datos)
    if (pendiente.current?.firma !== firma) pendiente.current = { firma, clave: crypto.randomUUID() }
    const creado = await ejecutar(() => bakeryApi.crearTransferenciaRestaurante({ ...datos, claveOperacion: pendiente.current!.clave }), 'Salida registrada')
    if (!creado) return
    pendiente.current = null
    setIngredienteId(''); setArticuloId(''); setCantidad(''); setPrecio(''); setConcepto('')
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-10">
    <div className="flex items-center gap-3"><ArrowRightLeft className="size-6 text-primary" /><div><h1 className="font-heading text-2xl font-semibold uppercase">Traslados entre areas</h1><p className="mt-1 text-sm text-muted-foreground">Cada area confirma por separado la salida, recepcion y pago de su mercancia.</p></div></div>
    {esAdmin && <form className="space-y-4 rounded-lg bg-surface-high p-5" onSubmit={(e) => { e.preventDefault(); if (valido && !guardando) void crear() }}>
      <h2 className="font-heading text-lg font-semibold uppercase">Restaurante → panaderia</h2>
      <p className="text-sm text-muted-foreground">Solo se transfieren ingredientes con stock. El destino es un insumo de panaderia con la misma unidad.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><Label htmlFor="res-tras-origen">Ingrediente origen</Label><Select value={ingredienteId} onValueChange={(valor) => { setIngredienteId(valor); setArticuloId('') }}><SelectTrigger id="res-tras-origen"><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent>{ingredientes?.map((i) => <SelectItem key={i.id_ingrediente} value={String(i.id_ingrediente)}>{i.nombre_ingrediente} · {i.stock_ingrediente} {i.unidades_ingrediente}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="res-tras-destino">Insumo destino</Label><Select value={articuloId} onValueChange={setArticuloId}><SelectTrigger id="res-tras-destino"><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent>{articulos?.filter((a) => a.activo && a.tipo === 'INSUMO' && a.unidad === ingrediente?.unidades_ingrediente).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nombre} · {a.unidad}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="res-tras-cantidad">Cantidad {ingrediente?.unidades_ingrediente}</Label><Input id="res-tras-cantidad" type="number" min={ingrediente?.unidades_ingrediente === 'UNIDADES' ? 1 : 0.0001} step={ingrediente?.unidades_ingrediente === 'UNIDADES' ? 1 : 0.0001} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
        <div><Label htmlFor="res-tras-precio">Precio por unidad de medida</Label><Input id="res-tras-precio" type="number" min="1" step="1" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>
        <div className="md:col-span-2 xl:col-span-4"><Label htmlFor="res-tras-concepto">Concepto</Label><Input id="res-tras-concepto" maxLength={150} value={concepto} onChange={(e) => setConcepto(e.target.value)} /></div>
      </div>
      {cantidad && precio && <p className="text-sm">Cuenta interna TR-RES: <strong>{formatearPrecio(monto)}</strong></p>}
      <Button type="submit" disabled={!valido || guardando}>{guardando ? 'Guardando…' : 'Registrar salida'}</Button>
    </form>}

    <section className="space-y-3"><h2 className="font-heading text-lg font-semibold uppercase">Salidas a panaderia</h2>
      {isPending ? <div className="h-32 animate-pulse rounded-lg bg-surface-high" /> : isError ? <p role="alert" className="text-destructive">No se pudieron cargar los traslados.</p>
        : !salidas?.length ? <p className="rounded-lg bg-surface-high p-4 text-sm text-muted-foreground">Aun no hay salidas registradas.</p>
          : salidas.map((t) => <article key={t.id} className="rounded-lg bg-surface-high p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><div><strong>TR-RES-{t.id} · {t.ingrediente.nombre_ingrediente} → {t.articuloDestino.nombre}</strong><p className="mt-1 text-muted-foreground">{t.concepto} · {t.cantidad} {t.ingrediente.unidades_ingrediente}</p></div><strong>{formatearPrecio(t.montoTotal)}</strong></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"><span>{t.fechaRecepcion ? 'Recibido en panaderia' : 'Pendiente de recepcion'}</span><span>·</span><span>{t.fechaPago ? 'Pagado' : 'Por pagar'}</span><span>·</span><span>{t.fechaConfirmacionIngreso ? 'Ingreso confirmado' : 'Ingreso sin confirmar'}</span>
              {t.fechaPago && !t.fechaConfirmacionIngreso && <Button size="sm" variant="secondary" disabled={guardando} onClick={() => setConfirmacion(t.id)}>Confirmar ingreso</Button>}
            </div>
          </article>)}
    </section>

    <section className="space-y-3 border-t border-border pt-6"><h2 className="font-heading text-lg font-semibold uppercase">Entradas desde panaderia</h2>
      {!entradas?.length ? <p className="rounded-lg bg-surface-high p-4 text-sm text-muted-foreground">Sin entradas pendientes.</p>
        : entradas.map((t) => <article key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-high p-4 text-sm"><div><strong>TR-PAN-{t.id} · {t.articulo.nombre}</strong><p className="mt-1 text-muted-foreground">{t.cantidad} {t.articulo.unidad} · {t.concepto}</p></div><div className="flex items-center gap-2"><strong>{formatearPrecio(t.montoTotal)}</strong>{!t.fechaRecepcion && <Button size="sm" variant="secondary" disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.recibirTransferencia(t.id), 'Mercancia recibida')}>Confirmar recepcion</Button>}</div></article>)}
    </section>

    {confirmacion !== null && <div role="dialog" aria-modal="true" aria-label="Confirmar ingreso del traslado" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md space-y-4 rounded-xl bg-surface-high p-6"><h2 className="font-heading text-lg font-semibold">Confirmar ingreso TR-RES-{confirmacion}</h2><p className="text-sm text-muted-foreground">Verifica que el dinero se recibio realmente en la caja o cuenta de restaurante antes de confirmar.</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmacion(null)}>Cancelar</Button><Button disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.confirmarIngresoRestaurante(confirmacion), 'Ingreso confirmado').then((ok) => { if (ok) setConfirmacion(null) })}>Confirmar</Button></div></div></div>}
  </div>
}
