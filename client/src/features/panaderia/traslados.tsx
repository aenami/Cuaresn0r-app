import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatearPrecio } from '@/lib/formato'
import { errorApi } from '@/features/billing/caja-comun'
import { productosQuery } from '@/features/catalogo/api'
import { ingredientesQuery } from '@/features/inventario/api'
import { articulosQuery, bakeryApi, bakeryKeys, transferenciasQuery, transferenciasRestauranteQuery } from './api'

export function TrasladosPanaderia({ esAdmin }: { esAdmin: boolean }) {
  const queryClient = useQueryClient()
  const { data: articulos } = useQuery({ ...articulosQuery, enabled: esAdmin })
  const { data: productos } = useQuery({ ...productosQuery, enabled: esAdmin })
  const { data: ingredientes } = useQuery({ ...ingredientesQuery, enabled: esAdmin })
  const { data: traslados, isPending, isError } = useQuery(transferenciasQuery)
  const { data: trasladosRestaurante } = useQuery(transferenciasRestauranteQuery)
  const [articuloId, setArticuloId] = useState('')
  const [destinoTipo, setDestinoTipo] = useState<'PRODUCTO' | 'INGREDIENTE'>('PRODUCTO')
  const [destinoId, setDestinoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [concepto, setConcepto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const operacionPendiente = useRef<{ firma: string; clave: string } | null>(null)
  const articuloElegido = articulos?.find((a) => a.id === Number(articuloId))
  const valido = articuloId && destinoId && Number.isFinite(Number(cantidad)) && Number(cantidad) > 0
    && (articuloElegido?.unidad !== 'UNIDADES' || Number.isInteger(Number(cantidad)))
    && Number.isInteger(Number(precio)) && Number(precio) > 0
    && Number.isInteger(Number(cantidad) * Number(precio)) && concepto.trim()

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setGuardando(true)
    try { await accion(); toast.success(mensaje); await queryClient.invalidateQueries({ queryKey: bakeryKeys.all }); return true }
    catch (error) { toast.error(errorApi(error)); return false }
    finally { setGuardando(false) }
  }

  async function crearTraslado() {
    const datos = { articuloId: Number(articuloId), cantidad: Number(cantidad), precioUnitario: Number(precio), concepto: concepto.trim(), ...(destinoTipo === 'PRODUCTO' ? { productoDestinoId: Number(destinoId) } : { ingredienteDestinoId: Number(destinoId) }) }
    const firma = JSON.stringify(datos)
    if (operacionPendiente.current?.firma !== firma) operacionPendiente.current = { firma, clave: crypto.randomUUID() }
    const creado = await ejecutar(() => bakeryApi.crearTransferencia({ ...datos, claveOperacion: operacionPendiente.current!.clave }), 'Traslado creado')
    if (!creado) return
    operacionPendiente.current = null
    setArticuloId('')
    setDestinoId('')
    setCantidad('')
    setPrecio('')
    setConcepto('')
  }

  return <div className="space-y-6">
    <div><div className="flex items-center gap-2"><ArrowRightLeft className="size-5 text-primary" /><h2 className="font-heading text-xl font-semibold uppercase">Traslados a restaurante</h2></div>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Cada salida crea una cuenta por pagar de restaurante con el precio pactado. La recepcion incorpora la mercancia; el pago se registra en su propia caja y luego se confirma como ingreso en panaderia.</p></div>

    {esAdmin && <form className="space-y-4 rounded-lg bg-surface-high p-5" onSubmit={(e) => { e.preventDefault(); if (!valido || guardando) return; void crearTraslado() }}>
      <h3 className="font-heading text-base font-semibold uppercase">Nuevo traslado</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><Label htmlFor="pan-tras-articulo">Sale de panaderia</Label><Select value={articuloId} onValueChange={(valor) => { setArticuloId(valor); setDestinoId('') }}><SelectTrigger id="pan-tras-articulo"><SelectValue placeholder="Seleccionar articulo" /></SelectTrigger><SelectContent>{articulos?.filter((a) => a.activo).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nombre} · {a.existencia} {a.unidad}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="pan-tras-tipo">Tipo en restaurante</Label><Select value={destinoTipo} onValueChange={(valor) => { setDestinoTipo(valor as 'PRODUCTO' | 'INGREDIENTE'); setDestinoId('') }}><SelectTrigger id="pan-tras-tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRODUCTO">Producto</SelectItem><SelectItem value="INGREDIENTE">Ingrediente</SelectItem></SelectContent></Select></div>
        <div><Label htmlFor="pan-tras-destino">Recibe restaurante</Label><Select value={destinoId} onValueChange={setDestinoId}><SelectTrigger id="pan-tras-destino"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger><SelectContent>{destinoTipo === 'PRODUCTO' ? (articuloElegido?.unidad === 'UNIDADES' ? productos?.filter((p) => p.habilitado_producto) : [])?.map((p) => <SelectItem key={p.id_producto} value={String(p.id_producto)}>{p.nombre_producto}</SelectItem>) : ingredientes?.filter((i) => i.unidades_ingrediente === articuloElegido?.unidad).map((i) => <SelectItem key={i.id_ingrediente} value={String(i.id_ingrediente)}>{i.nombre_ingrediente}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="pan-tras-cantidad">Cantidad {articuloElegido?.unidad}</Label><Input id="pan-tras-cantidad" type="number" min={articuloElegido?.unidad === 'UNIDADES' ? 1 : 0.0001} step={articuloElegido?.unidad === 'UNIDADES' ? 1 : 0.0001} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
        <div><Label htmlFor="pan-tras-precio">Precio pactado por unidad</Label><Input id="pan-tras-precio" type="number" min="1" step="1" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>
        <div className="md:col-span-2"><Label htmlFor="pan-tras-concepto">Concepto</Label><Input id="pan-tras-concepto" maxLength={150} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. pan para servicio de cafeteria" /></div>
      </div>
      {cantidad && precio && <p className="text-sm text-muted-foreground">Total a pagar: <strong className="text-foreground">{formatearPrecio(Number(cantidad) * Number(precio))}</strong></p>}
      <Button type="submit" disabled={!valido || guardando}>{guardando ? 'Guardando…' : 'Registrar salida y cuenta por pagar'}</Button>
    </form>}

    {isPending ? <div className="h-48 animate-pulse rounded-lg bg-surface-high" />
      : isError ? <p role="alert" className="text-sm text-destructive">No se pudieron cargar los traslados.</p>
        : !traslados?.length ? <p className="rounded-lg bg-surface-high p-6 text-sm text-muted-foreground">Los traslados entre areas apareceran aqui.</p>
          : <div className="space-y-3">{traslados.map((traslado) => {
            const pagos = traslado.cuentaPorPagar?.pagos ?? []
            const recibidos = new Set(traslado.pagos.map((p) => p.pagoCuentaPorPagarId))
            const saldo = Number(traslado.montoTotal) - pagos.reduce((suma, pago) => suma + Number(pago.monto_pagoCuentaPorPagar), 0)
            return <article key={traslado.id} className="rounded-lg bg-surface-high p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-heading text-base font-semibold">Traslado #{traslado.id} · {traslado.articulo.nombre}</h3><p className="mt-1 text-sm text-muted-foreground">{traslado.concepto} · {traslado.cantidad} unidades a {formatearPrecio(traslado.precioUnitario)}</p><p className="text-xs text-muted-foreground">Destino: {traslado.producto?.nombre_producto ?? traslado.ingrediente?.nombre_ingrediente}</p></div><strong className="font-heading text-lg tabular-nums">{formatearPrecio(traslado.montoTotal)}</strong></div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm"><span className={traslado.fechaRecepcion ? 'text-emerald-400' : 'text-tertiary'}>{traslado.fechaRecepcion ? 'Mercancia recibida' : 'Pendiente de recepcion en restaurante'}</span><span>Saldo: {formatearPrecio(saldo)}</span>{esAdmin && <Link to="/cuentas-por-pagar" className="text-primary hover:underline">Ver cuenta TR-PAN-{traslado.id}</Link>}</div>
              {pagos.filter((pago) => !recibidos.has(pago.id_pagoCuentaPorPagar)).map((pago) => <div key={pago.id_pagoCuentaPorPagar} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-low px-3 py-2 text-sm"><span>Pago #{pago.id_pagoCuentaPorPagar} · {pago.metodo_pagoCuentaPorPagar} · {formatearPrecio(pago.monto_pagoCuentaPorPagar)}</span><Button size="sm" disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.confirmarIngreso(traslado.id, pago.id_pagoCuentaPorPagar), 'Ingreso confirmado en panaderia')}>Confirmar ingreso</Button></div>)}
            </article>
          })}</div>}

    <section className="space-y-3 border-t border-border pt-6">
      <h3 className="font-heading text-lg font-semibold uppercase">Recibido desde restaurante</h3>
      <p className="text-sm text-muted-foreground">Un administrador registra la salida en la vista de restaurante. Aqui confirmas la recepcion y pagas desde el turno de panaderia.</p>
      {!trasladosRestaurante?.length ? <p className="rounded-lg bg-surface-high p-4 text-sm text-muted-foreground">No hay traslados entrantes.</p>
        : trasladosRestaurante.map((t) => <article key={t.id} className="rounded-lg bg-surface-high p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><div><strong>TR-RES-{t.id} · {t.ingrediente.nombre_ingrediente} → {t.articuloDestino.nombre}</strong><p className="mt-1 text-muted-foreground">{t.concepto} · {t.cantidad} {t.articuloDestino.unidad}</p></div><strong>{formatearPrecio(t.montoTotal)}</strong></div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"><span>{t.fechaRecepcion ? 'Recibido' : 'Pendiente de recibir'}</span><span>·</span><span>{t.fechaPago ? 'Pagado' : 'Pendiente de pago'}</span>
            {!t.fechaRecepcion && <Button size="sm" variant="secondary" disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.recibirTransferenciaRestaurante(t.id), 'Insumo recibido')}>Confirmar recepcion</Button>}
            {t.fechaRecepcion && !t.fechaPago && <><Button size="sm" disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.pagarTransferenciaRestaurante(t.id, 'EFECTIVO'), 'Pago en efectivo registrado')}>Pagar en efectivo</Button><Button size="sm" variant="secondary" disabled={guardando} onClick={() => void ejecutar(() => bakeryApi.pagarTransferenciaRestaurante(t.id, 'TRANSFERENCIA'), 'Transferencia registrada')}>Pagar por transferencia</Button></>}
          </div>
        </article>)}
    </section>
  </div>
}
