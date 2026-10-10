import { useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { useAreaTrabajo, useEsCaja } from '@/stores/auth.store'
import { articulosQuery } from '@/features/panaderia/api'
import { ingredientesQuery } from '@/features/inventario/api'
import { usePagarCuentaPorPagar } from '@/features/billing/cuentas-por-pagar-api'
import { errorApi } from '@/features/billing/caja-comun'
import { formatearPrecio } from '@/lib/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/_auth/remisiones')({
  component: PaginaRemisiones,
})
type Area = 'PANADERIA' | 'RESTAURANTE'
interface Linea {
  id: number
  nombreSnapshot: string
  cantidad: string
  precioUnitario: string
  subtotal: string
  concepto: string
  fechaEntrega: string
  detalleComandaId: number | null
  historialEdiciones?: unknown[] | null
}
interface Remision {
  id: number
  fecha: string
  modalidad: 'TURNO' | 'DIA'
  turnoId: number
  areaOrigen: Area
  areaDestino: Area
  montoTotal: string
  fechaCierre: string | null
  fechaIngreso: string | null
  cuentaPorPagarId: number | null
  cuentaPorPagar: { estado_cuentaPorPagar: string } | null
  detalles: Linea[]
}
interface Borrador {
  claveOperacion: string
  origen: string
  destino: string
  cantidad: string
  precio: string
  concepto: string
}
type Entrega = {
  modalidad: 'TURNO' | 'DIA'
  lineas: {
    claveOperacion: string
    articuloId?: number
    ingredienteDestinoId?: number
    ingredienteOrigenId?: number
    articuloDestinoId?: number
    cantidad: number
    precioUnitario: number
    concepto: string
  }[]
}
type Opcion = { id: number; nombre: string; unidad: string }
const nuevaLinea = (): Borrador => ({
  claveOperacion: crypto.randomUUID(),
  origen: '',
  destino: '',
  cantidad: '',
  precio: '',
  concepto: '',
})
const selectClass =
  'h-10 w-full rounded-md bg-surface-lowest px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary'
const nombreArea = (a: Area) =>
  a === 'PANADERIA' ? 'Panadería' : 'Restaurante'

function PaginaRemisiones() {
  const area = useAreaTrabajo(),
    esCaja = useEsCaja(),
    esPan = area === 'PANADERIA'
  const qc = useQueryClient()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['remisiones'],
    queryFn: () => api.get<Remision[]>('/bakery/remisiones'),
    refetchInterval: 15000,
  })
  const articulos = useQuery({ ...articulosQuery, enabled: esCaja && esPan })
  const ingredientes = useQuery({
    ...ingredientesQuery,
    enabled: esCaja && !esPan,
  })
  const destinos = useQuery({
    queryKey: ['remisiones', 'destinos', area],
    enabled: esCaja,
    queryFn: async (): Promise<Opcion[]> =>
      esPan
        ? (
            await api.get<
              {
                id_ingrediente: number
                nombre_ingrediente: string
                unidades_ingrediente: string
              }[]
            >('/bakery/remisiones/destinos')
          ).map((d) => ({
            id: d.id_ingrediente,
            nombre: d.nombre_ingrediente,
            unidad: d.unidades_ingrediente,
          }))
        : api.get<Opcion[]>('/bakery/remisiones/destinos'),
  })
  const origenes: Opcion[] = esPan
    ? (articulos.data ?? [])
        .filter((a) => a.activo && a.tipo !== 'INSUMO')
        .map((a) => ({
          id: a.id,
          nombre: `${a.nombre} · disponibles ${a.disponible ?? a.existencia}`,
          unidad: a.unidad,
        }))
    : (ingredientes.data ?? []).map((i) => ({
        id: i.id_ingrediente,
        nombre: i.nombre_ingrediente,
        unidad: i.unidades_ingrediente,
      }))
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const actual = data?.find((r) => r.id === seleccion) ?? data?.[0]
  const [abierta, setAbierta] = useState(false),
    [modalidad, setModalidad] = useState<'TURNO' | 'DIA'>('DIA')
  const [lineas, setLineas] = useState<Borrador[]>([])
  const pendiente = useRef<Entrega | null>(null)
  const [reintento, setReintento] = useState(false)
  const [editando, setEditando] = useState<Linea | null>(null)
  const [edicion, setEdicion] = useState({
    cantidad: '',
    precio: '',
    concepto: '',
  })
  const [pagoAbierto, setPagoAbierto] = useState(false),
    [metodo, setMetodo] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO')
  const pagar = usePagarCuentaPorPagar()
  const invalidar = async () => {
    await Promise.all(
      [
        'remisiones',
        'billing',
        'bakery',
        'inventario',
        'disponibilidad-panaderia',
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    )
  }
  const entregar = useMutation({
    mutationFn: (dto: Entrega) =>
      api.post<Remision>('/bakery/remisiones/lista', dto),
    onSuccess: async (r) => {
      pendiente.current = null
      setReintento(false)
      setSeleccion(r.id)
      setAbierta(false)
      setLineas([])
      await invalidar()
      toast.success('Lista de entregas confirmada')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status < 500) {
        pendiente.current = null
        setReintento(false)
      } else setReintento(true)
      toast.error(errorApi(e))
    },
  })
  const editar = useMutation({
    mutationFn: () =>
      api.patch(`/bakery/remisiones/entregas/${editando!.id}`, {
        cantidad: Number(edicion.cantidad),
        precioUnitario: Number(edicion.precio),
        concepto: edicion.concepto.trim(),
      }),
    onSuccess: async () => {
      setEditando(null)
      await invalidar()
      toast.success('Entrega corregida con historial')
    },
    onError: (e) => toast.error(errorApi(e)),
  })
  const accion = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: string }) =>
      api.post(`/bakery/remisiones/${id}/${accion}`),
    onSuccess: invalidar,
    onError: (e) => toast.error(errorApi(e)),
  })
  const errorDatos =
    destinos.isError || (esPan ? articulos.isError : ingredientes.isError)
  const valida =
    !errorDatos &&
    lineas.length > 0 &&
    lineas.every((l) => {
      const origen = origenes.find((o) => o.id === Number(l.origen)),
        destino = destinos.data?.find((d) => d.id === Number(l.destino))
      return (
        origen &&
        destino &&
        origen.unidad === destino.unidad &&
        Number(l.cantidad) > 0 &&
        (origen.unidad !== 'UNIDADES' ||
          Number.isInteger(Number(l.cantidad))) &&
        Number.isInteger(Number(l.precio)) &&
        Number(l.precio) > 0 &&
        !!l.concepto.trim()
      )
    })
  function confirmarEntrega() {
    if (!valida && !pendiente.current) return
    const dto = pendiente.current ?? {
      modalidad,
      lineas: lineas.map((l) => ({
        claveOperacion: l.claveOperacion,
        ...(esPan
          ? {
              articuloId: Number(l.origen),
              ingredienteDestinoId: Number(l.destino),
            }
          : {
              ingredienteOrigenId: Number(l.origen),
              articuloDestinoId: Number(l.destino),
            }),
        cantidad: Number(l.cantidad),
        precioUnitario: Number(l.precio),
        concepto: l.concepto.trim(),
      })),
    }
    pendiente.current = dto
    entregar.mutate(dto)
  }
  const cambiar = (clave: string, valores: Partial<Borrador>) =>
    setLineas((ls) =>
      ls.map((l) => (l.claveOperacion === clave ? { ...l, ...valores } : l)),
    )
  const propia = actual?.areaOrigen === area
  return (
    <div className="space-y-6 p-5 md:p-10">
      <header>
        <h1 className="font-heading text-3xl font-semibold">
          Remisiones entre áreas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Confirma las mercancías entregadas en una lista por turno o por día.
          Cada remisión muestra el valor pactado y se paga completa, sin abonos.
          Las entregas de pedidos con stock compartido se agregan
          automáticamente.
        </p>
      </header>
      {esCaja ? (
        <Button
          onClick={() => {
            if (!reintento) setLineas([nuevaLinea()])
            setAbierta(true)
          }}
        >
          {reintento
            ? 'Recuperar entrega pendiente'
            : `Registrar entregas a ${esPan ? 'Restaurante' : 'Panadería'}`}
        </Button>
      ) : null}
      {isPending ? (
        <p role="status">Cargando remisiones…</p>
      ) : isError ? (
        <div role="alert">
          <p className="text-destructive">
            No se pudieron consultar las remisiones.
          </p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !data?.length ? (
        <p className="py-6 text-muted-foreground">Aún no hay remisiones.</p>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <nav
            aria-label="Remisiones registradas"
            className="max-h-[65svh] space-y-2 overflow-y-auto"
          >
            {data.map((r) => (
              <button
                key={r.id}
                onClick={() => setSeleccion(r.id)}
                aria-current={actual?.id === r.id ? 'true' : undefined}
                className={`w-full rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${actual?.id === r.id ? 'bg-primary/15 text-primary' : 'bg-surface-high hover:bg-surface-low'}`}
              >
                <strong>Remisión #{r.id}</strong>
                <span className="mt-1 block text-xs">
                  {nombreArea(r.areaOrigen)} → {nombreArea(r.areaDestino)}
                  <br />
                  {r.fecha.slice(0, 10)} ·{' '}
                  {r.modalidad === 'DIA'
                    ? 'Todo el día'
                    : `Turno #${r.turnoId}`}
                </span>
                <span className="mt-2 block text-sm">
                  {formatearPrecio(r.montoTotal)} ·{' '}
                  {r.cuentaPorPagar?.estado_cuentaPorPagar === 'PAGADA'
                    ? 'Pagada'
                    : r.fechaCierre
                      ? 'Por pagar'
                      : 'En curso'}
                </span>
              </button>
            ))}
          </nav>
          {actual ? (
            <section className="min-w-0 space-y-4 rounded-xl bg-surface-high p-5">
              <div className="flex flex-wrap justify-between gap-4">
                <h2 className="font-heading text-xl font-semibold">
                  Remisión #{actual.id} · {nombreArea(actual.areaOrigen)} →{' '}
                  {nombreArea(actual.areaDestino)}
                </h2>
                <strong className="tabular-nums">
                  {formatearPrecio(actual.montoTotal)}
                </strong>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Producto / concepto</th>
                      <th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">Valor unitario</th>
                      <th className="p-2 text-right">Subtotal</th>
                      <th className="p-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actual.detalles.map((d) => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="py-3">
                          <strong>{d.nombreSnapshot}</strong>
                          <p className="text-xs text-muted-foreground">
                            {d.concepto} ·{' '}
                            {new Date(d.fechaEntrega).toLocaleString('es-CO')}
                            {d.detalleComandaId ? ' · Pedido compartido' : ''}
                          </p>
                          {d.historialEdiciones?.length ? (
                            <p className="text-xs text-tertiary">
                              {d.historialEdiciones.length} correcciones
                              registradas
                            </p>
                          ) : null}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {d.cantidad}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatearPrecio(d.precioUnitario)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatearPrecio(d.subtotal)}
                        </td>
                        <td className="p-2">
                          {esCaja &&
                          propia &&
                          !actual.fechaCierre &&
                          !d.detalleComandaId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Corregir ${d.nombreSnapshot}`}
                              onClick={() => {
                                setEditando(d)
                                setEdicion({
                                  cantidad: d.cantidad,
                                  precio: d.precioUnitario,
                                  concepto: d.concepto,
                                })
                              }}
                            >
                              <Pencil className="size-4" /> Corregir
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {actual.fechaCierre ? (
                <p className="text-sm text-muted-foreground">
                  Cerrada:{' '}
                  {new Date(actual.fechaCierre).toLocaleString('es-CO')} ·
                  cuenta por pagar #{actual.cuentaPorPagarId}
                </p>
              ) : esCaja && propia ? (
                <Button
                  disabled={accion.isPending}
                  onClick={() =>
                    accion.mutate({ id: actual.id, accion: 'cerrar' })
                  }
                >
                  Cerrar remisión y generar cuenta por pagar
                </Button>
              ) : null}
              {esCaja &&
              propia &&
              actual.cuentaPorPagar?.estado_cuentaPorPagar === 'PAGADA' &&
              !actual.fechaIngreso ? (
                <Button
                  disabled={accion.isPending}
                  onClick={() =>
                    accion.mutate({
                      id: actual.id,
                      accion: 'confirmar-ingreso',
                    })
                  }
                >
                  Confirmar dinero recibido en {nombreArea(area)}
                </Button>
              ) : null}
              {actual.fechaIngreso ? (
                <p className="text-sm text-emerald-300">
                  Ingreso confirmado:{' '}
                  {new Date(actual.fechaIngreso).toLocaleString('es-CO')}
                </p>
              ) : null}
              {esCaja &&
              !propia &&
              actual.fechaCierre &&
              actual.cuentaPorPagar?.estado_cuentaPorPagar !== 'PAGADA' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <Button onClick={() => setPagoAbierto(true)}>
                    Pagar remisión completa
                  </Button>
                  <Link
                    to="/cuentas-por-pagar"
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    Ver cuentas por pagar
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
      <Dialog
        open={abierta}
        onOpenChange={(v) => !entregar.isPending && setAbierta(v)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Entregas · {nombreArea(area)} →{' '}
              {esPan ? 'Restaurante' : 'Panadería'}
            </DialogTitle>
            <DialogDescription>
              Agrega varios productos y revisa cantidades y valores antes de
              confirmar la entrega física.
            </DialogDescription>
          </DialogHeader>
          {errorDatos ? (
            <div role="alert" className="text-destructive">
              No se pudieron cargar los productos.
              <Button
                variant="ghost"
                onClick={() => {
                  void destinos.refetch()
                  void (esPan ? articulos.refetch() : ingredientes.refetch())
                }}
              >
                Reintentar
              </Button>
            </div>
          ) : null}
          <fieldset
            disabled={entregar.isPending || reintento}
            className="space-y-4"
          >
            <label className="block text-sm">
              Agrupación
              <select
                className={selectClass}
                value={modalidad}
                onChange={(e) =>
                  setModalidad(e.target.value as 'TURNO' | 'DIA')
                }
              >
                <option value="DIA">Una remisión para todo el día</option>
                <option value="TURNO">Una remisión por turno</option>
              </select>
            </label>
            {lineas.map((l, i) => {
              const origen = origenes.find((o) => o.id === Number(l.origen))
              return (
                <section
                  key={l.claveOperacion}
                  className="space-y-3 border-t border-border pt-4"
                >
                  <div className="flex justify-between">
                    <h3 className="font-semibold">Producto {i + 1}</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar producto ${i + 1}`}
                      onClick={() =>
                        setLineas((ls) =>
                          ls.filter(
                            (x) => x.claveOperacion !== l.claveOperacion,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-4" /> Quitar
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Producto entregado
                      <select
                        className={selectClass}
                        value={l.origen}
                        onChange={(e) =>
                          cambiar(l.claveOperacion, {
                            origen: e.target.value,
                            destino: '',
                          })
                        }
                      >
                        <option value="">Selecciona un producto</option>
                        {origenes.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre} · {o.unidad}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Registro receptor
                      <select
                        className={selectClass}
                        value={l.destino}
                        onChange={(e) =>
                          cambiar(l.claveOperacion, { destino: e.target.value })
                        }
                      >
                        <option value="">Selecciona su equivalente</option>
                        {destinos.data
                          ?.filter((d) => d.unidad === origen?.unidad)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre} · {d.unidad}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Cantidad ({origen?.unidad ?? 'unidades'})
                      <Input
                        type="number"
                        min="0.0001"
                        step={origen?.unidad === 'UNIDADES' ? '1' : '0.0001'}
                        value={l.cantidad}
                        onChange={(e) =>
                          cambiar(l.claveOperacion, {
                            cantidad: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Valor unitario COP
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={l.precio}
                        onChange={(e) =>
                          cambiar(l.claveOperacion, { precio: e.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      Concepto
                      <Input
                        maxLength={150}
                        value={l.concepto}
                        onChange={(e) =>
                          cambiar(l.claveOperacion, {
                            concepto: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="text-right text-sm tabular-nums">
                    Subtotal:{' '}
                    {formatearPrecio(Number(l.cantidad) * Number(l.precio))}
                  </p>
                </section>
              )
            })}
            <Button
              type="button"
              variant="secondary"
              disabled={lineas.length >= 200}
              onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}
            >
              <Plus className="size-4" /> Agregar otro producto
            </Button>
          </fieldset>
          <p className="text-sm text-muted-foreground">
            El receptor debe tener creado el ingrediente equivalente con la
            misma unidad. Restaurante envía únicamente ingredientes con stock;
            Panadería envía productos. Las entregas automáticas de pedidos
            compartidos no requieren un registro receptor.
          </p>
          {reintento ? (
            <p role="alert" className="text-tertiary">
              No sabemos si la lista se recibió. Reintenta la misma operación
              para evitar duplicados.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="tabular-nums">
              Total:{' '}
              {formatearPrecio(
                lineas.reduce(
                  (s, l) => s + Number(l.cantidad) * Number(l.precio),
                  0,
                ),
              )}
            </strong>
            <Button
              disabled={entregar.isPending || (!valida && !pendiente.current)}
              onClick={confirmarEntrega}
            >
              {entregar.isPending
                ? 'Confirmando…'
                : reintento
                  ? 'Reintentar la misma lista'
                  : 'Confirmar lista entregada'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editando !== null}
        onOpenChange={(v) => !v && !editar.isPending && setEditando(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir {editando?.nombreSnapshot}</DialogTitle>
            <DialogDescription>
              Se ajustará la diferencia de existencias en ambas áreas. Se
              conserva quién hizo la corrección y el valor anterior.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="cor-qty">Cantidad total correcta</Label>
          <Input
            id="cor-qty"
            type="number"
            min="0.0001"
            step="0.0001"
            value={edicion.cantidad}
            onChange={(e) =>
              setEdicion({ ...edicion, cantidad: e.target.value })
            }
          />
          <Label htmlFor="cor-price">Valor unitario correcto</Label>
          <Input
            id="cor-price"
            type="number"
            min="1"
            step="1"
            value={edicion.precio}
            onChange={(e) => setEdicion({ ...edicion, precio: e.target.value })}
          />
          <Label htmlFor="cor-concepto">Concepto</Label>
          <Input
            id="cor-concepto"
            maxLength={150}
            value={edicion.concepto}
            onChange={(e) =>
              setEdicion({ ...edicion, concepto: e.target.value })
            }
          />
          <Button
            disabled={
              editar.isPending ||
              !(Number(edicion.cantidad) > 0) ||
              !Number.isInteger(Number(edicion.precio)) ||
              !(Number(edicion.precio) > 0) ||
              !edicion.concepto.trim()
            }
            onClick={() => editar.mutate()}
          >
            Guardar corrección
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pagoAbierto}
        onOpenChange={(v) => !pagar.isPending && setPagoAbierto(v)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar remisión #{actual?.id}</DialogTitle>
            <DialogDescription>
              Pago completo de {formatearPrecio(actual?.montoTotal ?? 0)} desde
              tu turno de {nombreArea(area)}.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Medio de pago
            <select
              className={selectClass}
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as typeof metodo)}
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia / Nequi</option>
            </select>
          </label>
          <Button
            disabled={pagar.isPending || !actual?.cuentaPorPagarId}
            onClick={() =>
              pagar
                .mutateAsync({
                  id: actual!.cuentaPorPagarId!,
                  monto: Number(actual!.montoTotal),
                  metodo,
                })
                .then(async () => {
                  setPagoAbierto(false)
                  await invalidar()
                  toast.success('Remisión pagada completa')
                })
                .catch((e) => toast.error(errorApi(e)))
            }
          >
            Confirmar pago completo
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
