import { useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { useAreaTrabajo, useEsCaja } from '@/stores/auth.store'
import { articulosQuery } from '@/features/panaderia/api'
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
import { TrasladosPanaderia } from '@/features/panaderia/traslados'

export const Route = createFileRoute('/_auth/remisiones')({
  component: PaginaRemisiones,
})
interface Remision {
  id: number
  fecha: string
  modalidad: 'TURNO' | 'DIA'
  turnoId: number
  montoTotal: string
  fechaCierre: string | null
  fechaIngreso: string | null
  cuentaPorPagarId: number | null
  cuentaPorPagar: { estado_cuentaPorPagar: string } | null
  detalles: {
    id: number
    nombreSnapshot: string
    cantidad: string
    precioUnitario: string
    subtotal: string
    concepto: string
    fechaEntrega: string
  }[]
}
type Entrega = {
  modalidad: 'TURNO' | 'DIA'
  articuloId: number
  ingredienteDestinoId: number
  cantidad: number
  precioUnitario: number
  concepto: string
  claveOperacion: string
}
const selectClass =
  'h-10 w-full rounded-md bg-surface-lowest px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary'

function PaginaRemisiones() {
  const area = useAreaTrabajo()
  const esCaja = useEsCaja()
  const operaPanaderia = area === 'PANADERIA' && esCaja
  const operaRestaurante = area === 'RESTAURANTE' && esCaja
  const queryClient = useQueryClient()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['remisiones'],
    queryFn: () => api.get<Remision[]>('/bakery/remisiones'),
    refetchInterval: 15000,
  })
  const {
    data: articulos,
    isError: errorArticulos,
    isPending: cargandoArticulos,
    refetch: recargarArticulos,
  } = useQuery({
    ...articulosQuery,
    enabled: operaPanaderia,
  })
  const {
    data: destinos,
    isError: errorDestinos,
    isPending: cargandoDestinos,
    refetch: recargarDestinos,
  } = useQuery({
    queryKey: ['remisiones', 'destinos'],
    queryFn: () =>
      api.get<
        {
          id_ingrediente: number
          nombre_ingrediente: string
          unidades_ingrediente: string
        }[]
      >('/bakery/remisiones/destinos'),
    enabled: operaPanaderia,
  })
  const [form, setForm] = useState({
    modalidad: 'TURNO' as 'TURNO' | 'DIA',
    articuloId: '',
    ingredienteDestinoId: '',
    cantidad: '',
    precio: '',
    concepto: '',
  })
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [metodo, setMetodo] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO')
  const [confirmarPago, setConfirmarPago] = useState(false)
  const [entregaAbierta, setEntregaAbierta] = useState(false)
  const operacionPendiente = useRef<Entrega | null>(null)
  const articulo = articulos?.find((a) => a.id === Number(form.articuloId))
  const actual = data?.find((r) => r.id === seleccion) ?? data?.[0]
  async function invalidar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['remisiones'] }),
      queryClient.invalidateQueries({ queryKey: ['billing'] }),
      queryClient.invalidateQueries({ queryKey: ['bakery'] }),
      queryClient.invalidateQueries({ queryKey: ['inventario'] }),
    ])
  }
  const accion = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: string }) =>
      api.post(`/bakery/remisiones/${id}/${accion}`),
    onSuccess: invalidar,
    onError: (e) => toast.error(errorApi(e)),
  })
  const entregar = useMutation({
    mutationFn: (dto: Entrega) =>
      api.post<Remision>('/bakery/remisiones/entregas', dto),
    onSuccess: async (r) => {
      operacionPendiente.current = null
      setSeleccion(r.id)
      setForm((f) => ({ ...f, cantidad: '', concepto: '' }))
      setEntregaAbierta(false)
      await invalidar()
      toast.success(
        'Entrega confirmada: salió de panadería y entró al restaurante',
      )
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status < 500)
        operacionPendiente.current = null
      toast.error(errorApi(e))
    },
  })
  const pagar = usePagarCuentaPorPagar()
  const valida =
    !errorArticulos &&
    !errorDestinos &&
    !!articulo &&
    !!form.ingredienteDestinoId &&
    Number.isInteger(Number(form.cantidad)) &&
    Number(form.cantidad) > 0 &&
    Number.isInteger(Number(form.precio)) &&
    Number(form.precio) > 0 &&
    !!form.concepto.trim()
  const subtotal = Number(form.cantidad || 0) * Number(form.precio || 0)
  return (
    <div className="space-y-6 p-5 md:p-10">
      <header>
        <h1 className="font-heading text-3xl font-semibold">
          Remisiones entre áreas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Cada entrega pasa mercancía de panadería al restaurante. El documento
          reúne las entregas por turno o por día y se paga completo al cerrarlo;
          no admite abonos.
        </p>
      </header>
      {operaPanaderia && (
        <>
          <Button type="button" onClick={() => setEntregaAbierta(true)}>
            Registrar entrega al restaurante
          </Button>
          <Dialog
            open={entregaAbierta}
            onOpenChange={(abierto) => {
              if (!entregar.isPending) setEntregaAbierta(abierto)
            }}
          >
            <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Confirmar entrega al restaurante</DialogTitle>
                <DialogDescription>
                  Registra los productos ya entregados y su valor pactado. Se
                  acumularán en la remisión elegida.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!valida && !operacionPendiente.current) return
                  const dto = operacionPendiente.current ?? {
                    modalidad: form.modalidad,
                    articuloId: Number(form.articuloId),
                    ingredienteDestinoId: Number(form.ingredienteDestinoId),
                    cantidad: Number(form.cantidad),
                    precioUnitario: Number(form.precio),
                    concepto: form.concepto.trim(),
                    claveOperacion: crypto.randomUUID(),
                  }
                  operacionPendiente.current = dto
                  entregar.mutate(dto)
                }}
              >
                {(errorArticulos || errorDestinos) && (
                  <div role="alert" className="space-y-2 text-sm">
                    <p className="text-destructive">
                      {errorArticulos
                        ? 'No se pudieron cargar los productos de panadería.'
                        : 'No se pudieron cargar los ingredientes receptores del restaurante.'}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void recargarArticulos()
                        void recargarDestinos()
                      }}
                    >
                      Reintentar opciones
                    </Button>
                  </div>
                )}
                {!cargandoArticulos &&
                  !errorArticulos &&
                  !articulos?.some((a) => a.activo && a.tipo !== 'INSUMO') && (
                    <p className="text-sm text-muted-foreground">
                      El administrador de panadería debe crear un producto
                      activo antes de registrar entregas.
                    </p>
                  )}
                {!cargandoDestinos && !errorDestinos && !destinos?.length && (
                  <p className="text-sm text-muted-foreground">
                    El administrador del restaurante debe crear el ingrediente
                    receptor para registrar la mercancía.
                  </p>
                )}
                <fieldset
                  disabled={
                    entregar.isPending ||
                    !!operacionPendiente.current ||
                    errorArticulos ||
                    errorDestinos ||
                    cargandoArticulos ||
                    cargandoDestinos
                  }
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <Label htmlFor="rem-modalidad">Agrupar entregas</Label>
                    <select
                      id="rem-modalidad"
                      className={selectClass}
                      value={form.modalidad}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          modalidad: e.target.value as 'TURNO' | 'DIA',
                        })
                      }
                    >
                      <option value="TURNO">Una remisión por turno</option>
                      <option value="DIA">Una remisión para todo el día</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="rem-producto">Producto de panadería</Label>
                    <select
                      id="rem-producto"
                      className={selectClass}
                      value={form.articuloId}
                      onChange={(e) => {
                        const a = articulos?.find(
                          (a) => a.id === Number(e.target.value),
                        )
                        setForm({
                          ...form,
                          articuloId: e.target.value,
                          precio: a?.precioVenta ?? '',
                          ingredienteDestinoId: '',
                        })
                      }}
                      required
                    >
                      <option value="">Selecciona un producto</option>
                      {articulos
                        ?.filter((a) => a.activo && a.tipo !== 'INSUMO')
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre} · disponibles {a.existencia}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="rem-destino">
                      Ingrediente receptor en restaurante
                    </Label>
                    <select
                      id="rem-destino"
                      className={selectClass}
                      value={form.ingredienteDestinoId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ingredienteDestinoId: e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">Selecciona el mismo producto</option>
                      {destinos
                        ?.filter(
                          (d) => d.unidades_ingrediente === articulo?.unidad,
                        )
                        .map((d) => (
                          <option
                            key={d.id_ingrediente}
                            value={d.id_ingrediente}
                          >
                            {d.nombre_ingrediente} · {d.unidades_ingrediente}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="rem-cantidad">Cantidad entregada</Label>
                    <Input
                      id="rem-cantidad"
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.cantidad}
                      onChange={(e) =>
                        setForm({ ...form, cantidad: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="rem-precio">Valor por unidad COP</Label>
                    <Input
                      id="rem-precio"
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.precio}
                      onChange={(e) =>
                        setForm({ ...form, precio: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="rem-concepto">Concepto de la entrega</Label>
                    <Input
                      id="rem-concepto"
                      maxLength={150}
                      required
                      value={form.concepto}
                      onChange={(e) =>
                        setForm({ ...form, concepto: e.target.value })
                      }
                    />
                  </div>
                </fieldset>
                <p className="text-sm text-muted-foreground">
                  El restaurante debe tener creado el producto como ingrediente
                  de igual unidad para registrar su entrada. Confirma solo
                  cuando se haya entregado físicamente.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>
                    Total de esta entrega: {formatearPrecio(subtotal)}
                  </strong>
                  <Button
                    disabled={
                      entregar.isPending ||
                      errorArticulos ||
                      errorDestinos ||
                      (!valida && !operacionPendiente.current)
                    }
                  >
                    {entregar.isPending
                      ? 'Registrando…'
                      : operacionPendiente.current
                        ? 'Reintentar la misma entrega'
                        : 'Confirmar entrega'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
      {isPending ? (
        <div className="h-48 animate-pulse bg-surface-high" />
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
        <p className="text-muted-foreground">
          Aún no hay remisiones. El cajero de panadería registra la primera
          entrega durante su turno.
        </p>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Remisiones registradas" className="space-y-2">
            {data.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSeleccion(r.id)
                  setConfirmarPago(false)
                }}
                aria-current={actual?.id === r.id ? 'true' : undefined}
                className={`w-full rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${actual?.id === r.id ? 'bg-primary/15 text-primary' : 'bg-surface-high hover:bg-surface-low'}`}
              >
                <strong>Remisión #{r.id}</strong>
                <span className="mt-1 block text-xs">
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
          {actual && (
            <section className="min-w-0 space-y-4 rounded-lg bg-surface-high p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="font-heading text-xl font-semibold">
                  Detalle de remisión #{actual.id}
                </h2>
                <strong className="tabular-nums">
                  {formatearPrecio(actual.montoTotal)}
                </strong>
              </div>
              <p className="text-xs text-muted-foreground lg:hidden">
                Desliza la tabla para ver cantidades, valores y subtotales →
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Entrega</th>
                      <th className="p-2">Producto / concepto</th>
                      <th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">Valor unitario</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actual.detalles.map((d) => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="py-3">
                          {new Date(d.fechaEntrega).toLocaleString('es-CO')}
                        </td>
                        <td className="p-2">
                          <strong>{d.nombreSnapshot}</strong>
                          <p className="text-xs text-muted-foreground">
                            {d.concepto}
                          </p>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {actual.fechaCierre && (
                <p className="text-sm text-muted-foreground">
                  Cerrada:{' '}
                  {new Date(actual.fechaCierre).toLocaleString('es-CO')} ·
                  cuenta por pagar #{actual.cuentaPorPagarId}
                </p>
              )}
              {operaPanaderia && !actual.fechaCierre && (
                <div className="space-y-2">
                  <Button
                    disabled={accion.isPending}
                    onClick={() =>
                      accion.mutate({ id: actual.id, accion: 'cerrar' })
                    }
                  >
                    Cerrar remisión
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Genera la cuenta por pagar del restaurante y bloquea nuevas
                    entregas en este documento.
                  </p>
                </div>
              )}
              {operaPanaderia &&
                actual.cuentaPorPagar?.estado_cuentaPorPagar === 'PAGADA' &&
                !actual.fechaIngreso && (
                  <Button
                    disabled={accion.isPending}
                    onClick={() =>
                      accion.mutate({
                        id: actual.id,
                        accion: 'confirmar-ingreso',
                      })
                    }
                  >
                    Confirmar dinero recibido en panadería
                  </Button>
                )}
              {actual.fechaIngreso && (
                <p className="text-sm text-emerald-300">
                  Ingreso confirmado en panadería:{' '}
                  {new Date(actual.fechaIngreso).toLocaleString('es-CO')}
                </p>
              )}
              {operaRestaurante &&
                actual.fechaCierre &&
                actual.cuentaPorPagar?.estado_cuentaPorPagar !== 'PAGADA' && (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Pago completo desde tu turno de restaurante.
                    </p>
                    <label className="block max-w-xs text-sm">
                      Medio de pago
                      <select
                        className={selectClass}
                        value={metodo}
                        onChange={(e) => {
                          setMetodo(
                            e.target.value as 'EFECTIVO' | 'TRANSFERENCIA',
                          )
                          setConfirmarPago(false)
                        }}
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">
                          Transferencia / Nequi
                        </option>
                      </select>
                    </label>
                    {confirmarPago ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm">
                          ¿Confirmas pagar {formatearPrecio(actual.montoTotal)}?
                        </p>
                        <Button
                          disabled={pagar.isPending}
                          onClick={() =>
                            pagar
                              .mutateAsync({
                                id: actual.cuentaPorPagarId!,
                                monto: Number(actual.montoTotal),
                                metodo,
                              })
                              .then(async () => {
                                setConfirmarPago(false)
                                await invalidar()
                                toast.success('Remisión pagada completa')
                              })
                              .catch((e) => toast.error(errorApi(e)))
                          }
                        >
                          Confirmar pago completo
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmarPago(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={() => setConfirmarPago(true)}>
                        Pagar remisión completa
                      </Button>
                    )}
                    <Link
                      to="/cuentas-por-pagar"
                      className="block text-sm text-primary underline"
                    >
                      Ver cuentas por pagar
                    </Link>
                  </div>
                )}
            </section>
          )}
        </div>
      )}
      {operaPanaderia && (
        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Entradas desde restaurante y traslados anteriores
          </summary>
          <div className="mt-5">
            <TrasladosPanaderia esAdmin={false} puedeRecibir={false} />
          </div>
        </details>
      )}
    </div>
  )
}
