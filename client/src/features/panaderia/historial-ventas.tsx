import { useQuery } from '@tanstack/react-query'
import { ventasQuery } from './api'
import { formatearPrecio } from '@/lib/formato'

export function HistorialVentasPanaderia() {
  const { data, isPending, isError } = useQuery(ventasQuery)
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">
        Ventas cobradas de panadería
      </h2>
      {isPending ? (
        <div className="h-48 animate-pulse bg-surface-high" />
      ) : isError ? (
        <p role="alert" className="text-destructive">
          No se pudieron consultar las ventas.
        </p>
      ) : !data?.length ? (
        <p className="text-muted-foreground">
          Las ventas aparecerán aquí al cobrar en mostrador.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="p-3">Venta / turno</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Productos</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="p-3">
                    #{v.id} · turno #{v.turnoId}
                  </td>
                  <td className="p-3">
                    {new Date(v.fecha).toLocaleString('es-CO')}
                  </td>
                  <td className="p-3">
                    {v.detalles
                      .map((d) => `${d.cantidad} × ${d.nombreSnapshot}`)
                      .join(', ')}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatearPrecio(v.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
