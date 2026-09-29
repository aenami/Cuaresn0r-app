import { Fragment, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Boxes, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatearPrecio } from '@/lib/formato'
import { errorApi } from '@/features/billing/caja-comun'
import { articulosQuery, bakeryApi, bakeryKeys, conteoQuery } from './api'
import type { ArticuloPanaderia, TipoArticulo, UnidadInventario } from './api'
import { useAuthStore } from '@/stores/auth.store'
import { puedeEntradaPanaderia } from '@/lib/acceso'
import { RecepcionesPanaderia } from './recepciones'
import { ValoracionDelConteo } from '@/features/inventario/valoracion-conteo'

type Operacion = 'entrada' | 'conteo' | 'merma' | 'editar'

export function InventarioPanaderia({ esAdmin, vista }: { esAdmin: boolean; vista: 'conteo' | 'ingredientes' | 'catalogo' }) {
  const rol = useAuthStore((s) => s.usuario?.rolNombre)
  const queryClient = useQueryClient()
  const { data: articulos, isPending, isError } = useQuery(articulosQuery)
  const { data: estado, isPending: conteoCargando } = useQuery(conteoQuery)
  const [seleccion, setSeleccion] = useState<ArticuloPanaderia | null>(null)
  const [operacion, setOperacion] = useState<Operacion>('entrada')
  const [cantidad, setCantidad] = useState('')
  const [concepto, setConcepto] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoArticulo>('PANADERIA')
  const [unidad, setUnidad] = useState<UnidadInventario>('UNIDADES')
  const [precio, setPrecio] = useState('')
  const [costo, setCosto] = useState('')
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const conteos = new Map((estado?.detalle ?? []).map((conteo) => [conteo.articuloId, conteo]))
  const proyeccion = new Map((estado?.proyeccion ?? []).map((fila) => [fila.articuloId, fila]))
  const visibles = vista === 'ingredientes' ? articulos?.filter((articulo) => articulo.tipo === 'INSUMO') : vista === 'catalogo' ? articulos?.filter((a) => a.tipo !== 'INSUMO') : articulos

  function elegir(articulo: ArticuloPanaderia, accion: Operacion) {
    setSeleccion(articulo)
    setOperacion(accion)
    setCantidad('')
    setConcepto('')
    setNombre(articulo.nombre)
    setPrecio(String(Number(articulo.precioVenta)))
    setCosto(articulo.costoReferencia == null ? '' : articulo.costoReferencia)
  }

  async function crear() {
    if (!nombre.trim() || !costoValido || (vista === 'conteo' && (precio === '' || !Number.isInteger(Number(precio)) || Number(precio) < 0))) return
    setGuardando(true)
    try {
      await bakeryApi.crearArticulo({ nombre: nombre.trim(), tipo: vista === 'ingredientes' ? 'INSUMO' : tipo, unidad: vista === 'ingredientes' ? unidad : 'UNIDADES', precioVenta: vista === 'ingredientes' ? 0 : Number(precio), ...(vista === 'ingredientes' && { costoReferencia: costo === '' ? null : Number(costo) }) })
      toast.success('Articulo agregado')
      setCreando(false)
      setNombre('')
      setPrecio('')
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  async function guardar() {
    if (!seleccion || guardando) return
    setGuardando(true)
    try {
      if (operacion === 'editar') {
        await bakeryApi.actualizarArticulo(seleccion.id, { nombre: nombre.trim(), ...(seleccion.tipo === 'INSUMO' ? { costoReferencia: costo === '' ? null : Number(costo) } : { precioVenta: Number(precio) }) })
        toast.success('Articulo actualizado')
      } else if (operacion === 'conteo') {
        await bakeryApi.conteo(seleccion.id, Number(cantidad))
        toast.success('Conteo registrado')
      } else {
        const body = { cantidad: Number(cantidad), concepto: concepto.trim() }
        if (operacion === 'entrada') await bakeryApi.entrada(seleccion.id, body)
        else await bakeryApi.merma(seleccion.id, body)
        toast.success(operacion === 'entrada' ? 'Entrada registrada' : 'Merma registrada')
      }
      setSeleccion(null)
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
      await queryClient.invalidateQueries({ queryKey: ['inventario', 'valoracion-mensual'] })
    } catch (error) { toast.error(errorApi(error)) }
    finally { setGuardando(false) }
  }

  const cantidadValida = cantidad !== '' && Number.isFinite(Number(cantidad)) && Number(cantidad) >= (operacion === 'conteo' ? 0 : 0.0001)
    && (seleccion?.unidad !== 'UNIDADES' || Number.isInteger(Number(cantidad)))
  const costoValido = costo === '' || (Number.isFinite(Number(costo)) && Number(costo) >= 0)
  const editarValido = nombre.trim() !== '' && (seleccion?.tipo === 'INSUMO' ? costoValido : Number.isInteger(Number(precio)) && Number(precio) >= 0)
  const puedeGuardar = operacion === 'editar' ? editarValido : cantidadValida && (operacion === 'conteo' || concepto.trim() !== '')

  return <div className="space-y-6">
    {vista === 'ingredientes' && <RecepcionesPanaderia />}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="font-heading text-xl font-semibold uppercase">{vista === 'ingredientes' ? 'Ingredientes de panadería' : 'Conteo diario de panadería'}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{vista === 'ingredientes' ? 'Insumos exclusivos de panadería. Las hornadas descuentan automáticamente las cantidades de sus recetas.' : 'Las hornadas y recepciones suman. El conteo compara la salida física con ventas, consumo de recetas, traslados y mermas.'}</p></div>
      {esAdmin && <Button size="sm" onClick={() => { setSeleccion(null); setCreando(true); setNombre(''); setPrecio(''); setCosto(''); setTipo(vista === 'ingredientes' ? 'INSUMO' : 'PANADERIA'); setUnidad('UNIDADES') }}><Plus className="mr-1 size-4" /> {vista === 'ingredientes' ? 'Ingrediente' : 'Artículo'}</Button>}
    </div>

    {vista === 'conteo' && <div className="rounded-lg bg-surface-low p-4 text-sm">
      {conteoCargando ? <span className="text-muted-foreground">Cargando conteo de hoy…</span>
        : estado ? <div className="flex flex-wrap justify-between gap-2"><span>Conteo de {estado.fecha}: <strong>{estado.detalle.length} de {estado.totalArticulos} articulos</strong></span>
          <span className={estado.completo ? 'text-emerald-400' : 'text-tertiary'}>{estado.completo ? 'Completo' : `${estado.faltantes.length + estado.recontar.length} por contar o revisar`}</span></div>
          : <span className="text-destructive">No se pudo consultar el conteo.</span>}
      {estado && Number(estado.valorDiferencia) !== 0 && <p className="mt-2 text-tertiary">Diferencia valorada: {formatearPrecio(estado.valorDiferencia)}. Es una estimacion para investigar; no crea una venta ni un cobro.</p>}
    </div>}

    {creando && esAdmin && <form className="grid gap-3 rounded-lg bg-surface-high p-4 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_8rem_9rem_auto] lg:items-end" onSubmit={(e) => { e.preventDefault(); void crear() }}>
      <div><Label htmlFor="pan-nombre-nuevo">Nombre</Label><Input id="pan-nombre-nuevo" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoFocus /></div>
      {vista === 'conteo' ? <div><Label htmlFor="pan-tipo-nuevo">Tipo</Label><Select value={tipo} onValueChange={(valor) => setTipo(valor as TipoArticulo)}><SelectTrigger id="pan-tipo-nuevo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PANADERIA">Panadería</SelectItem><SelectItem value="PASTELERIA">Pastelería</SelectItem><SelectItem value="EXTERNO">Bebida / externo</SelectItem></SelectContent></Select></div> : <p className="self-end pb-2 text-sm text-muted-foreground">Insumo no vendible</p>}
      {vista === 'ingredientes' ? <div><Label htmlFor="pan-unidad-nuevo">Unidad</Label><Select value={unidad} onValueChange={(valor) => setUnidad(valor as UnidadInventario)}><SelectTrigger id="pan-unidad-nuevo"><SelectValue /></SelectTrigger><SelectContent>{(['UNIDADES', 'kg', 'g', 'dg', 'mg', 'ml', 'L'] as const).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div> : null}
      {vista === 'conteo' ? <div><Label htmlFor="pan-precio-nuevo">Precio COP</Label><Input id="pan-precio-nuevo" type="number" min="0" step="1" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div> : null}
      {vista === 'ingredientes' ? <div><Label htmlFor="pan-costo-nuevo">Costo COP / {unidad} (opcional)</Label><Input id="pan-costo-nuevo" type="number" min="0" step="0.0001" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Sin referencia" /></div> : null}
      <div className="flex gap-2"><Button type="submit" disabled={guardando || !nombre.trim() || !costoValido || (vista === 'conteo' && precio === '')}>Crear</Button><Button type="button" variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button></div>
    </form>}

    {isPending ? <div className="h-72 animate-pulse rounded-lg bg-surface-high" />
      : isError ? <p role="alert" className="text-sm text-destructive">No se pudo cargar el inventario.</p>
        : (visibles ?? []).length === 0 ? <div className="rounded-lg bg-surface-high p-8 text-center"><Boxes className="mx-auto size-7 text-primary" /><p className="mt-2 text-sm">{vista === 'ingredientes' ? 'Aún no hay ingredientes de panadería. Agrégalos para poder crear recetas.' : 'Empieza creando los panes y bebidas que se venderán en panadería.'}</p></div>
          : <div><p className="mb-2 text-xs text-muted-foreground lg:hidden">Desliza la tabla para ver el conteo y las acciones →</p><div className="overflow-x-auto rounded-lg bg-surface-high"><table className="w-full min-w-[68rem] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Artículo</th><th className="px-4 py-3 text-right">Inicio del día</th><th className="px-4 py-3 text-right">Entradas</th><th className="px-4 py-3 text-right">Ventas POS</th><th className="px-4 py-3 text-right">Consumo receta</th><th className="px-4 py-3 text-right">Existencia sistema</th><th className="px-4 py-3 text-right">Conteo físico</th><th className="px-4 py-3 text-right">Diferencia</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody>
            {visibles?.map((articulo) => {
              const conteo = conteos.get(articulo.id)
              const dia = proyeccion.get(articulo.id)
              const diferencia = Number(conteo?.conciliacion.diferenciaUnidades ?? 0)
              return <Fragment key={articulo.id}><tr className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3"><strong>{articulo.nombre}</strong><span className="ml-2 text-xs text-muted-foreground">{articulo.tipo === 'PANADERIA' ? 'Panadería' : articulo.tipo === 'PASTELERIA' ? 'Pastelería' : articulo.tipo === 'INSUMO' ? 'Insumo' : 'Externo'} · {articulo.unidad}</span>{!articulo.activo && <span className="ml-2 text-xs text-tertiary">Inactivo</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dia?.cantidadInicial ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dia?.entradas ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dia?.ventasRegistradas ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{dia?.consumoReceta ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{articulo.existencia}</td>
                <td className="px-4 py-3 text-right tabular-nums">{conteo ? conteo.cantidadFisica : 'Pendiente'}{conteo?.requiereReconteo && <span className="block text-xs text-tertiary">Recontar</span>}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${diferencia > 0 ? 'text-destructive' : diferencia < 0 ? 'text-tertiary' : 'text-emerald-400'}`}>{conteo ? `${diferencia > 0 ? 'Faltan ' : diferencia < 0 ? 'Sobran ' : ''}${Math.abs(diferencia)}` : '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{puedeEntradaPanaderia(rol, articulo.tipo) && <button className="mr-3 text-primary hover:underline" onClick={() => elegir(articulo, 'entrada')}>{['PANADERIA', 'PASTELERIA'].includes(articulo.tipo) ? 'Producción' : 'Recibir'}</button>}{vista === 'conteo' && <button className="mr-3 text-primary hover:underline" onClick={() => elegir(articulo, 'conteo')}>Contar</button>}{puedeEntradaPanaderia(rol, articulo.tipo) && <button className="mr-3 text-muted-foreground hover:text-foreground" onClick={() => elegir(articulo, 'merma')}>Merma</button>}{esAdmin && <button className="text-muted-foreground hover:text-foreground" onClick={() => elegir(articulo, 'editar')}>Editar</button>}</td>
              </tr>{vista === 'conteo' && articulo.activo && <tr className="border-b border-border/40"><td colSpan={9} className="px-4 pb-4"><div className="w-[calc(100vw-6rem)] max-w-3xl lg:w-full"><ValoracionDelConteo valoracion={conteo?.valoracion} pendiente={!conteo} esIngrediente={articulo.tipo === 'INSUMO'} /></div></td></tr>}</Fragment>
            })}</tbody></table></div></div>}

    {seleccion && <section className="max-w-2xl rounded-lg bg-surface-high p-5" aria-labelledby="pan-operacion-title">
      <h3 id="pan-operacion-title" className="font-heading text-lg font-semibold uppercase">{operacion === 'entrada' ? 'Registrar entrada' : operacion === 'conteo' ? 'Registrar conteo fisico' : operacion === 'merma' ? 'Registrar merma' : 'Editar articulo'} · {seleccion.nombre}</h3>
      {operacion === 'conteo' && <p className="mt-2 text-sm text-muted-foreground">Cuenta las unidades fisicas que quedan. Si despues entran o salen articulos, deberas contar de nuevo antes del cierre.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {operacion === 'editar' ? <><div><Label htmlFor="pan-editar-nombre">Nombre</Label><Input id="pan-editar-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>{seleccion.tipo === 'INSUMO' ? <div><Label htmlFor="pan-editar-costo">Costo COP / {seleccion.unidad} (opcional)</Label><Input id="pan-editar-costo" type="number" min="0" step="0.0001" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Sin referencia" /><p className="mt-1 text-xs text-muted-foreground">Se guarda al confirmar cada conteo; no cambia valoraciones anteriores.</p></div> : <div><Label htmlFor="pan-editar-precio">Precio COP</Label><Input id="pan-editar-precio" type="number" min="0" step="1" value={precio} onChange={(e) => setPrecio(e.target.value)} /></div>}</>
          : <><div><Label htmlFor="pan-cantidad">{operacion === 'conteo' ? 'Cantidad fisica' : 'Cantidad'} ({seleccion.unidad})</Label><Input id="pan-cantidad" type="number" min={operacion === 'conteo' ? 0 : seleccion.unidad === 'UNIDADES' ? 1 : 0.0001} step={seleccion.unidad === 'UNIDADES' ? 1 : 0.0001} inputMode="decimal" autoFocus value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>{operacion !== 'conteo' && <div><Label htmlFor="pan-concepto">Concepto</Label><Input id="pan-concepto" value={concepto} maxLength={200} onChange={(e) => setConcepto(e.target.value)} placeholder={operacion === 'entrada' ? 'Ej. hornada de la mañana' : 'Ej. producto dañado'} /></div>}</>}
      </div>
      <div className="mt-4 flex gap-2"><Button onClick={() => void guardar()} disabled={guardando || !puedeGuardar}>{guardando ? 'Guardando…' : 'Registrar'}</Button><Button variant="ghost" onClick={() => setSeleccion(null)}>Cancelar</Button></div>
    </section>}
  </div>
}
