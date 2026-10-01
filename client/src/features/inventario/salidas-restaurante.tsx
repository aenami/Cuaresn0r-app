import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CalendarDays, PackageMinus } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { formatearCantidad } from '@/lib/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ingredientesQuery,
  productosInventarioQuery,
  salidasRestauranteQuery,
  useRegistrarMovimiento,
  useRegistrarSalidaProducto,
} from './api'

function fechaColombia() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)!.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function errorTexto(error: unknown) {
  return error instanceof ApiError ? error.message : 'No se pudo registrar la salida'
}

export function SalidasRestaurante({ puedeRegistrar }: { puedeRegistrar: boolean }) {
  const [fecha, setFecha] = useState(fechaColombia)
  const [tipo, setTipo] = useState<'PRODUCTO' | 'INGREDIENTE'>('PRODUCTO')
  const [objetivoId, setObjetivoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const { data: productos, isPending: cargandoProductos } = useQuery({ ...productosInventarioQuery, enabled: puedeRegistrar })
  const { data: ingredientes, isPending: cargandoIngredientes } = useQuery({ ...ingredientesQuery, enabled: puedeRegistrar })
  const { data: salidas, isPending: cargandoSalidas, error } = useQuery(salidasRestauranteQuery(fecha))
  const registrarProducto = useRegistrarSalidaProducto()
  const registrarIngrediente = useRegistrarMovimiento()
  const registrando = registrarProducto.isPending || registrarIngrediente.isPending
  const opciones = tipo === 'PRODUCTO'
    ? (productos ?? []).filter((producto) => producto.habilitado_producto)
      .map((producto) => ({ id: producto.id_producto, nombre: producto.nombre_producto, unidad: 'UNIDADES' }))
    : (ingredientes ?? []).map((ingrediente) => ({
      id: ingrediente.id_ingrediente, nombre: ingrediente.nombre_ingrediente, unidad: ingrediente.unidades_ingrediente,
    }))

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const valor = Number(cantidad)
    const razon = motivo.trim()
    if (!objetivoId || !Number.isFinite(valor) || valor <= 0 || (tipo === 'PRODUCTO' && !Number.isSafeInteger(valor))) {
      toast.error(tipo === 'PRODUCTO' ? 'Selecciona un producto y una cantidad entera mayor a cero' : 'Selecciona un ingrediente y una cantidad mayor a cero')
      return
    }
    if (!razon || razon.length > 150) {
      toast.error('Indica un motivo de hasta 150 caracteres')
      return
    }
    try {
      if (tipo === 'PRODUCTO') {
        await registrarProducto.mutateAsync({ productoId: Number(objetivoId), cantidad: valor, motivo: razon })
      } else {
        await registrarIngrediente.mutateAsync({ idIngrediente: Number(objetivoId), tipo: 'SALIDA_MANUAL', cantidad: valor, motivo: razon })
      }
      setCantidad('')
      setMotivo('')
      setFecha(fechaColombia())
      toast.success('Salida con motivo registrada')
    } catch (error) {
      toast.error(errorTexto(error))
    }
  }

  return (
    <section aria-label="Salidas de inventario" className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Salidas con motivo</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Documenta mercancía que sale sin venderse. El conteo diario la reconocerá como salida justificada;
          las entregas a clientes se registran desde Pedidos para evitar duplicarlas.
        </p>
      </div>

      {puedeRegistrar ? (
        <form onSubmit={registrar} className="rounded-xl bg-surface-low p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(8rem,0.7fr)]">
            <div>
              <Label htmlFor="salida-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(valor) => { setTipo(valor as typeof tipo); setObjetivoId(''); setCantidad('') }}>
                <SelectTrigger id="salida-tipo" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCTO">Producto de catálogo</SelectItem>
                  <SelectItem value="INGREDIENTE">Ingrediente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="salida-objetivo">{tipo === 'PRODUCTO' ? 'Producto' : 'Ingrediente'}</Label>
              <Select value={objetivoId} onValueChange={setObjetivoId} disabled={cargandoProductos || cargandoIngredientes}>
                <SelectTrigger id="salida-objetivo" className="mt-1.5 w-full"><SelectValue placeholder="Selecciona un elemento" /></SelectTrigger>
                <SelectContent>
                  {opciones.map((opcion) => (
                    <SelectItem key={opcion.id} value={String(opcion.id)}>{opcion.nombre} · {opcion.unidad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="salida-cantidad">Cantidad</Label>
              <Input id="salida-cantidad" className="mt-1.5 tabular-nums" type="number" min="0" step={tipo === 'PRODUCTO' ? '1' : 'any'} value={cantidad} onChange={(evento) => setCantidad(evento.target.value)} placeholder="0" required />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="salida-motivo">Motivo de la salida</Label>
              <Input id="salida-motivo" className="mt-1.5" value={motivo} maxLength={150} onChange={(evento) => setMotivo(evento.target.value)} placeholder="Ej.: producto averiado" required />
            </div>
            <Button type="submit" className="btn-heat shrink-0 gap-2" disabled={registrando || !objetivoId || !cantidad || !motivo.trim()}>
              <PackageMinus className="size-4" /> {registrando ? 'Registrando…' : 'Registrar salida'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Los productos de carta no tienen stock propio en restaurante: esta salida queda documentada para el conteo, sin modificar ventas ni caja.
          </p>
        </form>
      ) : null}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold">Historial de salidas</h3>
            <p className="mt-1 text-sm text-muted-foreground">Productos e ingredientes que salieron sin venta, con su razón y responsable.</p>
          </div>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value || fechaColombia())} className="w-44 bg-surface-low pl-9 tabular-nums" aria-label="Fecha del historial de salidas" />
          </div>
        </div>
        {cargandoSalidas ? <p className="mt-4 text-sm text-muted-foreground">Cargando salidas…</p>
          : error ? <p className="mt-4 text-sm text-destructive" role="alert">No se pudo consultar el historial de salidas.</p>
          : salidas?.length === 0 ? <p className="mt-4 rounded-xl bg-surface-low p-6 text-sm text-muted-foreground">No hay salidas con motivo registradas en esta fecha.</p>
          : <ul className="mt-4 space-y-2">
            {salidas?.map((salida) => (
              <li key={salida.id} className="flex flex-col gap-3 rounded-lg bg-surface-low p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-heading font-semibold">{salida.nombre}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{salida.clase === 'MERMA' ? 'Merma de ingrediente' : salida.tipo === 'PRODUCTO' ? 'Producto' : 'Salida de ingrediente'} · {salida.usuario}</p>
                  <p className="mt-2 text-sm text-foreground">{salida.motivo}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="flex items-center gap-1 font-heading text-lg font-semibold tabular-nums text-tertiary sm:justify-end">
                    <ArrowUpRight className="size-4" /> {formatearCantidad(salida.cantidad)} <span className="text-xs font-normal text-muted-foreground">{salida.unidad}</span>
                  </p>
                  <time dateTime={salida.fecha} className="mt-1 block text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date(salida.fecha))}
                  </time>
                </div>
              </li>
            ))}
          </ul>}
      </div>
    </section>
  )
}
