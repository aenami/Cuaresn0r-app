import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Power, Printer, RefreshCw, Server, SquarePen, Trash2, TriangleAlert } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useEsAdmin } from '@/stores/auth.store'
import {
  impresorasQuery,
  useActualizarImpresora,
  useEliminarImpresora,
  useProbarImpresora,
} from '@/features/impresion/api'
import { ImpresoraFormDialog } from '@/features/impresion/impresora-form-dialog'
import type { Impresora } from '@/types/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_auth/impresoras')({
  component: PaginaImpresoras,
})

function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}

type Destino = Impresora['destino_impresora']

function nombreDestino(d: Destino): string {
  return d === 'COCINA' ? 'Cocina' : d === 'BARRA' ? 'Barra' : d === 'CAJA' ? 'Caja' : 'Cocina y barra'
}

function PaginaImpresoras() {
  const esAdmin = useEsAdmin()
  const { data: impresoras, isPending } = useQuery(impresorasQuery)
  const actualizar = useActualizarImpresora()
  const eliminar = useEliminarImpresora()
  const probar = useProbarImpresora()
  const [dialogo, setDialogo] = useState<{ abierto: boolean; impresora: Impresora | null }>({
    abierto: false,
    impresora: null,
  })

  if (!esAdmin) {
    return (
      <div className="p-6 md:p-10">
        <p className="text-sm text-muted-foreground">
          La configuracion de impresoras la maneja el administrador.
        </p>
      </div>
    )
  }

  const lista = impresoras ?? []
  const activas = lista.filter((i) => i.impresora_activa)
  const hayGeneralActiva = activas.some((i) => i.destino_impresora === 'GENERAL')
  const destinosSinCubrir = (['COCINA', 'BARRA', 'CAJA'] as const).filter((d) =>
    d === 'CAJA'
      ? !activas.some((i) => i.destino_impresora === 'CAJA')
      : !hayGeneralActiva && !activas.some((i) => i.destino_impresora === d),
  )

  return (
    <div className="p-6 md:p-10">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="micro-label mb-2 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Hardware · impresoras
          </p>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Impresoras</h1>
        </div>
        <button
          type="button"
          onClick={() => setDialogo({ abierto: true, impresora: null })}
          className="btn-heat group inline-flex h-11 shrink-0 items-center gap-2.5 rounded-lg pl-2 pr-4 font-heading text-sm font-semibold uppercase tracking-wide"
        >
          <span className="grid size-6 place-items-center rounded-md bg-primary-foreground/15 transition-transform group-hover:rotate-90">
            <Plus className="size-4" strokeWidth={2.75} />
          </span>
          Nueva impresora
        </button>
      </div>

      {isPending ? (
        <p className="mt-8 text-sm text-muted-foreground">Cargando impresoras…</p>
      ) : lista.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-lg bg-surface-high text-muted-foreground">
            <Printer className="size-6" />
          </div>
          <p className="mt-4 font-heading text-lg font-semibold">Sin impresoras configuradas</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            La impresion queda apagada: las comandas y facturas solo se ven en pantalla.
            Registra la impresora de preparacion y la de caja para habilitar ambos recorridos.
          </p>
        </div>
      ) : (
        <>
          {/* Tarjetas de resumen (conteos reales de la configuracion) */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TarjetaResumen
              etiqueta="Impresoras activas"
              valor={activas.length}
              sufijo="configuradas por ruta"
              acento="primary"
              icono={Printer}
            />
            <TarjetaResumen
              etiqueta="Destinos sin cubrir"
              valor={destinosSinCubrir.length}
              sufijo={
                destinosSinCubrir.length > 0
                  ? destinosSinCubrir.map(nombreDestino).join(' · ')
                  : 'todo cubierto'
              }
              acento={destinosSinCubrir.length > 0 ? 'tertiary' : 'muted'}
              icono={TriangleAlert}
            />
            <TarjetaResumen
              etiqueta="Total configuradas"
              valor={lista.length}
              sufijo={`${lista.length - activas.length} inactivas`}
              acento="muted"
              icono={Server}
            />
          </div>

          {/* Tabla de dispositivos */}
          <div className="mt-6 overflow-hidden rounded-xl bg-surface-low">
            <div className="hidden items-center gap-4 border-b border-border px-5 py-3 md:flex">
              <span className="micro-label w-8">Sts</span>
              <span className="micro-label flex-1">Impresora</span>
              <span className="micro-label w-28">Ruta</span>
              <span className="micro-label w-44">Dispositivo USB</span>
              <span className="micro-label w-16">Papel</span>
              <span className="micro-label w-40 text-right">Acciones</span>
            </div>
            <ul className="divide-y divide-border">
              {lista.map((impresora) => (
                <FilaImpresora
                  key={impresora.id_impresora}
                  impresora={impresora}
                  probando={probar.isPending && probar.variables === impresora.id_impresora}
                  activando={actualizar.isPending && actualizar.variables?.id === impresora.id_impresora}
                  eliminando={eliminar.isPending && eliminar.variables === impresora.id_impresora}
                  onProbar={() =>
                    probar
                      .mutateAsync(impresora.id_impresora)
                      .then((r) =>
                        r.ok
                          ? toast.success('Ticket de prueba enviado')
                          : toast.error(`No respondio: ${r.motivo ?? 'sin detalle'}`),
                      )
                      .catch((e: unknown) => toast.error(errorATexto(e)))
                  }
                  onEditar={() => setDialogo({ abierto: true, impresora })}
                  onActivar={() =>
                    actualizar
                      .mutateAsync({ id: impresora.id_impresora, activa: true })
                      .then(() => toast.success('Impresora activada'))
                      .catch((e: unknown) => toast.error(errorATexto(e)))
                  }
                  onEliminar={() =>
                    eliminar
                      .mutateAsync(impresora.id_impresora)
                      .then(() => toast.success('Impresora eliminada'))
                      .catch((e: unknown) => toast.error(errorATexto(e)))
                  }
                />
              ))}
            </ul>
          </div>

          {/* Nota honesta de ruteo (sustituye las "reglas de ruteo" del mockup) */}
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Las comandas van a la impresora <span className="text-foreground">Cocina y barra</span>{' '}
            (o a una dedicada por zona). Las facturas van exclusivamente a{' '}
            <span className="text-foreground">Caja</span>: si no hay una impresora de caja activa,
            el sistema no enviara el recibo a la impresora de preparacion.
          </p>
        </>
      )}

      <ImpresoraFormDialog
        impresora={dialogo.impresora}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  )
}

function FilaImpresora({
  impresora,
  probando,
  activando,
  eliminando,
  onProbar,
  onEditar,
  onActivar,
  onEliminar,
}: {
  impresora: Impresora
  probando: boolean
  activando: boolean
  eliminando: boolean
  onProbar: () => void
  onEditar: () => void
  onActivar: () => void
  onEliminar: () => void
}) {
  const activa = impresora.impresora_activa
  const dispositivo = impresora.dispositivo_impresora ?? 'Sin configurar'

  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        {/* Estado */}
        <div className="flex w-8 items-center">
          <PuntoEstado activa={activa} />
        </div>

        {/* Nombre (+ meta compacta en movil) */}
        <div className="min-w-0 flex-1">
          <p className={cn('font-heading text-base font-semibold', !activa && 'text-muted-foreground')}>
            {impresora.nombre_impresora}
          </p>
          <p className={cn('micro-label mt-0.5', activa ? 'text-primary' : 'text-muted-foreground')}>
            {activa ? 'Activa' : 'Inactiva'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground md:hidden">
            <BadgeRuta destino={impresora.destino_impresora} />
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Printer className="size-3.5" /> {dispositivo}
            </span>
            <span>{impresora.ancho_papel_impresora}mm</span>
          </div>
        </div>

        {/* Ruta / destino (desktop) */}
        <div className="hidden w-28 md:block">
          <BadgeRuta destino={impresora.destino_impresora} />
        </div>

        {/* Direccion (desktop) */}
        <div className="hidden w-44 items-center gap-2 text-sm tabular-nums text-muted-foreground md:flex">
          <Printer className="size-4 shrink-0" />
          <span className="truncate" title={dispositivo}>{dispositivo}</span>
        </div>

        {/* Papel (desktop) */}
        <div className="hidden w-16 text-sm text-muted-foreground md:block">
          {impresora.ancho_papel_impresora}mm
        </div>

        {/* Acciones */}
        <div className="flex w-full items-center gap-1.5 md:w-40 md:justify-end">
          <BotonAccion title="Imprimir prueba" onClick={onProbar} disabled={probando}>
            {probando ? <RefreshCw className="size-4 animate-spin" /> : <Printer className="size-4" />}
          </BotonAccion>
          <BotonAccion title="Editar" onClick={onEditar}>
            <SquarePen className="size-4" />
          </BotonAccion>
          {!activa ? (
            <BotonAccion title="Activar" onClick={onActivar} disabled={activando}>
              <Power className="size-4" />
            </BotonAccion>
          ) : null}
          <BotonAccion title="Eliminar" onClick={onEliminar} disabled={eliminando} peligro>
            <Trash2 className="size-4" />
          </BotonAccion>
        </div>
      </div>
    </li>
  )
}

function PuntoEstado({ activa }: { activa: boolean }) {
  return (
    <span className="relative flex size-2.5" aria-hidden>
      {activa ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
      ) : null}
      <span
        className={cn(
          'relative inline-flex size-2.5 rounded-full',
          activa ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      />
    </span>
  )
}

function BadgeRuta({ destino }: { destino: Destino }) {
  const clase =
    destino === 'COCINA'
      ? 'bg-primary/15 text-primary'
      : destino === 'BARRA'
        ? 'bg-tertiary/15 text-tertiary'
        : destino === 'CAJA'
          ? 'bg-secondary text-secondary-foreground'
          : 'bg-primary/10 text-primary'
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
        clase,
      )}
    >
      {nombreDestino(destino)}
    </span>
  )
}

function BotonAccion({
  children,
  title,
  onClick,
  disabled,
  peligro,
}: {
  children: ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  peligro?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'grid size-9 place-items-center rounded-md border border-border bg-surface-high text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        peligro && 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {children}
    </button>
  )
}

function TarjetaResumen({
  etiqueta,
  valor,
  sufijo,
  acento,
  icono: Icono,
}: {
  etiqueta: string
  valor: number
  sufijo: string
  acento: 'primary' | 'tertiary' | 'muted'
  icono: ComponentType<{ className?: string }>
}) {
  const borde =
    acento === 'primary' ? 'border-primary' : acento === 'tertiary' ? 'border-tertiary' : 'border-border'
  const color =
    acento === 'primary' ? 'text-primary' : acento === 'tertiary' ? 'text-tertiary' : 'text-muted-foreground'
  return (
    <div className={cn('relative overflow-hidden rounded-xl border-l-4 bg-surface-high p-5', borde)}>
      <Icono className={cn('pointer-events-none absolute right-4 top-4 size-12 opacity-10', color)} />
      <p className="micro-label">{etiqueta}</p>
      <p className="mt-4 font-heading text-5xl font-bold leading-none tabular-nums">{valor}</p>
      <p className={cn('mt-2 text-xs font-semibold uppercase tracking-wider', color)}>{sufijo}</p>
    </div>
  )
}
