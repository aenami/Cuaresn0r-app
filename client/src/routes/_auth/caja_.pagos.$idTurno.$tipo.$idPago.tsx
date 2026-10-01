import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ReceiptText } from 'lucide-react'
import { turnoQuery } from '@/features/billing/api'
import { ApiError } from '@/lib/api'
import { formatearCantidad, formatearPrecio } from '@/lib/formato'
import type { PagoNominaCuadre, PagoProveedorCuadre, TurnoResumen } from '@/types/api'

export const Route = createFileRoute('/_auth/caja_/pagos/$idTurno/$tipo/$idPago')({
  component: DetallePagoCuadre,
})

type TipoPago = 'nomina' | 'proveedor' | 'traslado'

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
})

function formatearFechaHora(fecha: string) {
  return fechaHora.format(new Date(fecha))
}

function esTipoPago(tipo: string): tipo is TipoPago {
  return tipo === 'nomina' || tipo === 'proveedor' || tipo === 'traslado'
}

function buscarPago(turno: TurnoResumen, tipo: TipoPago, idPago: number) {
  if (tipo === 'nomina') {
    return turno.detallePagosNomina.find((pago) => pago.id === idPago)
  }
  const origen = tipo === 'proveedor' ? 'CUENTA_POR_PAGAR' : 'TRASLADO_INTERNO'
  return turno.detallePagosProveedores.find(
    (pago) => pago.id === idPago && pago.origen === origen,
  )
}

function DetallePagoCuadre() {
  const { idTurno: idTurnoParam, tipo, idPago: idPagoParam } = Route.useParams()
  const idTurno = Number(idTurnoParam)
  const idPago = Number(idPagoParam)
  const parametrosValidos =
    Number.isSafeInteger(idTurno) && idTurno > 0 &&
    Number.isSafeInteger(idPago) && idPago > 0 && esTipoPago(tipo)
  const { data: turno, isPending, isError, error, refetch } = useQuery({
    ...turnoQuery(idTurno),
    enabled: parametrosValidos,
  })
  const volver = (
    <Link
      to="/caja"
      search={{ turno: parametrosValidos && turno?.estado_turno === 'CERRADO' ? idTurno : undefined }}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Volver al historial de cuadres
    </Link>
  )

  if (!parametrosValidos) {
    return <EstadoDetalle titulo="Referencia de pago inválida" descripcion="Revisa el enlace e intenta abrir el pago desde el historial de cuadres." volver={volver} />
  }
  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 p-6 md:p-10" role="status" aria-label="Cargando detalle del pago">
        <div className="h-5 w-52 animate-pulse rounded bg-surface-high" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-high" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-high" />
      </div>
    )
  }
  if (isError || !turno) {
    const noEncontrado = error instanceof ApiError && error.status === 404
    return (
      <EstadoDetalle
        titulo={noEncontrado ? 'Cuadre no encontrado' : 'No se pudo cargar el cuadre'}
        descripcion={noEncontrado ? 'El turno indicado ya no está disponible.' : error instanceof Error ? error.message : 'Comprueba tu conexión y vuelve a intentarlo.'}
        volver={volver}
        onReintentar={noEncontrado ? undefined : () => void refetch()}
      />
    )
  }

  const pago = buscarPago(turno, tipo, idPago)
  if (!pago) {
    return <EstadoDetalle titulo="Pago no encontrado" descripcion="Este pago no pertenece al turno y tipo indicados. Puedes buscarlo de nuevo en el historial." volver={volver} />
  }

  const esNomina = tipo === 'nomina'
  const pagoNomina = esNomina ? pago as PagoNominaCuadre : null
  const pagoProveedor = esNomina ? null : pago as PagoProveedorCuadre
  const titulo = esNomina ? 'Pago a empleado' : tipo === 'traslado' ? 'Pago por traslado interno' : 'Pago a proveedor'
  const destinatario = pagoNomina?.empleado ?? pagoProveedor?.proveedor ?? 'Sin destinatario'
  const area = turno.caja?.area === 'PANADERIA' ? 'Panadería' : 'Restaurante / cafetería'

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      {volver}
      <header className="mt-7 flex flex-wrap items-start justify-between gap-5 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-tight md:text-4xl">{titulo}</h1>
          <p className="mt-2 text-base text-muted-foreground">{destinatario}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md border border-tertiary/40 bg-tertiary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-tertiary">
          <ReceiptText className="size-3.5" aria-hidden="true" /> Registrado
        </span>
      </header>

      <main className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="min-w-0 rounded-xl bg-surface-high p-5 md:p-7" aria-labelledby="resumen-pago">
          <h2 id="resumen-pago" className="font-heading text-lg font-semibold uppercase">Detalle del pago</h2>
          <p className="mt-6 font-heading text-4xl font-semibold tabular-nums text-primary md:text-5xl">{formatearPrecio(pago.monto)}</p>
          <dl className="mt-7 divide-y divide-border/60 border-t border-border/60">
            <Dato etiqueta="Fecha y hora" valor={formatearFechaHora(pago.fecha)} />
            <Dato etiqueta="Medio" valor={pago.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'} />
            <Dato etiqueta="Concepto" valor={pago.concepto} />
            {pagoNomina?.observacion ? <Dato etiqueta="Observación" valor={pagoNomina.observacion} /> : null}
            {pagoProveedor?.documento ? <Dato etiqueta="Documento" valor={pagoProveedor.documento} /> : null}
            {pagoProveedor?.idCuenta ? <Dato etiqueta="Cuenta por pagar" valor={`#${pagoProveedor.idCuenta}`} /> : null}
          </dl>
        </section>

        <aside className="h-fit rounded-xl bg-surface-low p-5 text-sm" aria-label="Origen del registro">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide">Origen del registro</h2>
          <dl className="mt-4 divide-y divide-border/60">
            <Dato etiqueta="Comprobante" valor={`#${pago.id}`} apilado />
            <Dato etiqueta="Turno" valor={`#${turno.id_turno}`} apilado />
            <Dato etiqueta="Área" valor={area} apilado />
            <Dato etiqueta="Caja" valor={turno.caja?.nombre_caja ?? `#${turno.id_caja_turno}`} apilado />
            <Dato etiqueta="Responsable del turno" valor={turno.usuario?.email_usuario ?? `Usuario #${turno.id_usuario_turno}`} apilado />
          </dl>
        </aside>
      </main>

      {pagoNomina && pagoNomina.desglose.length > 0 ? (
        <section className="mt-6 rounded-xl bg-surface-high p-5 md:p-7" aria-labelledby="desglose-pago">
          <h2 id="desglose-pago" className="font-heading text-lg font-semibold uppercase">Conceptos incluidos</h2>
          <ul className="mt-4 divide-y divide-border/60">
            {pagoNomina.desglose.map((detalle) => (
              <li key={detalle.idDevengo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <span>{detalle.concepto} <span className="text-muted-foreground">· {formatearFechaHora(detalle.fechaDevengo)}</span></span>
                <span className="font-semibold tabular-nums">{formatearPrecio(detalle.montoAplicado)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pagoProveedor?.traslado ? (
        <section className="mt-6 rounded-xl bg-surface-high p-5 md:p-7" aria-labelledby="mercancia-traslado">
          <h2 id="mercancia-traslado" className="font-heading text-lg font-semibold uppercase">Mercancía trasladada</h2>
          <dl className="mt-4 divide-y divide-border/60">
            <Dato etiqueta="Ingrediente" valor={pagoProveedor.traslado.ingrediente} />
            <Dato etiqueta="Cantidad" valor={`${formatearCantidad(pagoProveedor.traslado.cantidad)} ${pagoProveedor.traslado.unidad}`} />
            <Dato etiqueta="Valor unitario" valor={formatearPrecio(pagoProveedor.traslado.precioUnitario)} />
            <Dato etiqueta="Salida" valor={formatearFechaHora(pagoProveedor.traslado.fechaSalida)} />
          </dl>
        </section>
      ) : null}
    </div>
  )
}

function Dato({ etiqueta, valor, apilado = false }: { etiqueta: string; valor: string; apilado?: boolean }) {
  return (
    <div className={apilado ? 'py-3' : 'flex flex-wrap justify-between gap-x-6 gap-y-1 py-3'}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={apilado ? 'mt-1 break-words font-medium' : 'min-w-0 break-words text-sm font-medium sm:text-right'}>{valor}</dd>
    </div>
  )
}

function EstadoDetalle({ titulo, descripcion, volver, onReintentar }: {
  titulo: string
  descripcion: string
  volver: ReactNode
  onReintentar?: () => void
}) {
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      {volver}
      <div className="mt-7 rounded-xl bg-surface-high p-6 md:p-8" role="alert">
        <h1 className="font-heading text-2xl font-semibold uppercase">{titulo}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{descripcion}</p>
        {onReintentar ? (
          <button type="button" onClick={onReintentar} className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Reintentar
          </button>
        ) : null}
      </div>
    </div>
  )
}
