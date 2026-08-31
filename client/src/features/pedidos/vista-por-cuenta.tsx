import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, Loader2, Plus, Receipt } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { useCrearSubcuenta, useReasignarItem } from '@/features/pedidos/api'
import type { DetalleComanda, Pedido } from '@/types/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { errorATexto } from './comun'

// Vista "por cuenta": agrupa los items enviados por subcuenta con subtotal,
// permite mover items entre cuentas y crear nuevas. Solo asignacion directa
// (un item completo a una cuenta); un header de combo arrastra a sus hijos.
export function VistaPorCuenta({ pedido, editable }: { pedido: Pedido; editable: boolean }) {
  const idPedido = pedido.id_pedido
  const reasignar = useReasignarItem(idPedido)
  const crearSubcuenta = useCrearSubcuenta(idPedido)
  const [dialogoCuenta, setDialogoCuenta] = useState(false)
  const [nombreCuenta, setNombreCuenta] = useState('')

  const subcuentas = [...(pedido.subcuentas ?? [])].sort((a, b) => a.id_subcuenta - b.id_subcuenta)
  const detalles = (pedido.comandas ?? []).flatMap((c) => c.detalles ?? [])

  // Cuentas con su nombre visible (la primera es siempre la principal).
  const cuentas = subcuentas.map((sub, i) => ({
    id: sub.id_subcuenta,
    nombre: sub.nombre_subcuenta ?? `Cuenta ${i + 1}`,
    esPrincipal: i === 0,
  }))

  // Padres no cancelados de una cuenta (los hijos se muestran anidados).
  const itemsDe = (idSub: number) =>
    detalles.filter(
      (d) => d.id_detalleComandaPadre_dc === null && d.id_subcuenta_dc === idSub && d.estado_dc !== 'CANCELADO',
    )
  // Subtotal = todas las filas (padres e hijos) no canceladas de la cuenta,
  // igual que factura el backend.
  const subtotalDe = (idSub: number | null) =>
    detalles
      .filter((d) => d.id_subcuenta_dc === idSub && d.estado_dc !== 'CANCELADO')
      .reduce((acc, d) => acc + Number(d.precio_unitario_dc) * d.cantidad_producto_dc, 0)

  // Defensivo: items repartidos (id_subcuenta_dc null) no caen en ninguna
  // cuenta directa. No se crean desde esta UI, pero no deben desaparecer.
  const sinAsignar = detalles.filter(
    (d) => d.id_detalleComandaPadre_dc === null && d.id_subcuenta_dc === null && d.estado_dc !== 'CANCELADO',
  )

  function crear() {
    crearSubcuenta
      .mutateAsync(nombreCuenta.trim() || undefined)
      .then(() => {
        toast.success('Cuenta creada')
        setNombreCuenta('')
        setDialogoCuenta(false)
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  function mover(idItem: number, idSubcuenta: number) {
    reasignar
      .mutateAsync({ idItem, idSubcuenta })
      .then(() => toast.success('Item movido de cuenta'))
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <div className="space-y-3">
      {cuentas.map((cuenta) => {
        const items = itemsDe(cuenta.id)
        const destinos = cuentas.filter((c) => c.id !== cuenta.id)
        return (
          <TarjetaCuenta
            key={cuenta.id}
            titulo={cuenta.nombre}
            esPrincipal={cuenta.esPrincipal}
            subtotal={subtotalDe(cuenta.id)}
          >
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin items en esta cuenta.</p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <ItemCuenta
                    key={item.id_detalleComanda}
                    item={item}
                    editable={editable}
                    destinos={destinos}
                    moviendo={reasignar.isPending && reasignar.variables?.idItem === item.id_detalleComanda}
                    onMover={(idSub) => mover(item.id_detalleComanda, idSub)}
                  />
                ))}
              </ul>
            )}
          </TarjetaCuenta>
        )
      })}

      {sinAsignar.length > 0 ? (
        <TarjetaCuenta titulo="Sin asignar" subtotal={subtotalDe(null)}>
          <ul className="space-y-2.5">
            {sinAsignar.map((item) => (
              <ItemCuenta
                key={item.id_detalleComanda}
                item={item}
                editable={false}
                destinos={[]}
                moviendo={false}
                onMover={() => {}}
              />
            ))}
          </ul>
        </TarjetaCuenta>
      ) : null}

      {editable ? (
        <button
          type="button"
          onClick={() => setDialogoCuenta(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-150 ease-out-quart hover:border-primary/50 hover:text-primary active:scale-[0.99]"
        >
          <Plus className="size-4" />
          Nueva cuenta
        </button>
      ) : null}

      <Dialog
        open={dialogoCuenta}
        onOpenChange={(abierto) => {
          setDialogoCuenta(abierto)
          if (!abierto) setNombreCuenta('')
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Nueva cuenta</DialogTitle>
            <DialogDescription>
              Divide el pedido en cuentas para cobrar por separado. El nombre es opcional.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              crear()
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="nombre-cuenta">Nombre (opcional)</Label>
              <Input
                id="nombre-cuenta"
                value={nombreCuenta}
                onChange={(e) => setNombreCuenta(e.target.value)}
                maxLength={30}
                placeholder={`Cuenta ${subcuentas.length + 1}`}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="btn-heat w-full font-heading uppercase tracking-wide"
              disabled={crearSubcuenta.isPending}
            >
              {crearSubcuenta.isPending ? 'Creando…' : 'Crear cuenta'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Tarjeta de una cuenta: nombre, subtotal y sus items. La principal se marca
// con acento primario; las demas, con acento terciario.
function TarjetaCuenta({
  titulo,
  esPrincipal,
  subtotal,
  children,
}: {
  titulo: string
  esPrincipal?: boolean
  subtotal: number
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border-l-4 bg-surface-high p-3',
        esPrincipal ? 'border-primary' : 'border-tertiary',
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Receipt className="size-3.5 shrink-0 text-muted-foreground" />
          <h4 className="truncate font-heading text-sm font-semibold tracking-tight">{titulo}</h4>
        </div>
        <span className="shrink-0 font-heading text-sm font-semibold tabular-nums text-primary">
          {formatearPrecio(subtotal)}
        </span>
      </div>
      {children}
    </section>
  )
}

// Un item en la vista por cuenta: cantidad, nombre, adiciones con precio, total
// del item y menu para moverlo a otra cuenta.
function ItemCuenta({
  item,
  editable,
  destinos,
  moviendo,
  onMover,
}: {
  item: DetalleComanda
  editable: boolean
  destinos: { id: number; nombre: string }[]
  moviendo: boolean
  onMover: (idSubcuenta: number) => void
}) {
  const nombre = item.producto?.nombre_producto ?? item.combo?.nombre_combo ?? 'Item'
  const adiciones = (item.hijos ?? []).filter(
    (h) => h.estado_dc !== 'CANCELADO' && Number(h.precio_unitario_dc) > 0,
  )
  const total =
    Number(item.precio_unitario_dc) * item.cantidad_producto_dc +
    adiciones.reduce((acc, h) => acc + Number(h.precio_unitario_dc) * h.cantidad_producto_dc, 0)

  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm">
          <span className="tabular-nums text-muted-foreground">{item.cantidad_producto_dc}×</span> {nombre}
        </p>
        {adiciones.map((h) => (
          <p key={h.id_detalleComanda} className="text-xs text-muted-foreground">
            + {h.cantidad_producto_dc}× {h.producto?.nombre_producto ?? 'Producto'}
          </p>
        ))}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm tabular-nums">{formatearPrecio(total)}</span>
        {editable && destinos.length > 0 ? (
          <MenuMover destinos={destinos} moviendo={moviendo} onMover={onMover} />
        ) : null}
      </div>
    </li>
  )
}

// Menu para reasignar un item a otra cuenta.
function MenuMover({
  destinos,
  moviendo,
  onMover,
}: {
  destinos: { id: number; nombre: string }[]
  moviendo: boolean
  onMover: (idSubcuenta: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={moviendo}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors duration-150 ease-out-quart hover:border-primary/50 hover:text-foreground disabled:opacity-50"
        >
          {moviendo ? <Loader2 className="size-3 animate-spin" /> : <ArrowRightLeft className="size-3" />}
          Mover
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
        {destinos.map((d) => (
          <DropdownMenuItem key={d.id} onSelect={() => onMover(d.id)}>
            <Receipt />
            <span className="truncate">{d.nombre}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
