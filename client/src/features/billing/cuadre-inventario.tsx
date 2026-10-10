import type { CuadreInventarioDiario } from '@/types/api'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

export function InformeInventario({
  data,
  reales,
}: {
  data: CuadreInventarioDiario
  reales?: {
    efectivo: number
    transferencia: number | null
    tarjeta: number | null
  }
}) {
  const efectivo = reales
    ? Number(data.realesPrevios.efectivoSinBase) + reales.efectivo
    : Number(data.efectivo.realSinBase)
  const digital = reales
    ? data.realesPrevios.transferencia === null || reales.transferencia === null
      ? null
      : Number(data.realesPrevios.transferencia) + reales.transferencia
    : data.transferencia.real === null
      ? null
      : Number(data.transferencia.real)
  const tarjeta = reales
    ? data.realesPrevios.tarjeta === null || reales.tarjeta === null
      ? null
      : Number(data.realesPrevios.tarjeta) + reales.tarjeta
    : data.tarjeta.real === null
      ? null
      : Number(data.tarjeta.real)
  return (
    <section className="min-w-0 space-y-4 rounded-xl bg-surface-high p-5 sm:p-6">
      <h2 className="font-heading text-xl font-semibold">
        Descuadre por inventario · día completo
      </h2>
      <p className="text-sm text-muted-foreground">
        {data.fecha} · Turnos {data.turnos.map((t) => `#${t}`).join(', ')}.
        Estima ventas físicas incluyendo entradas y excluyendo mermas y
        remisiones justificadas. No crea ventas en el POS. Las ventas estimadas
        no registradas se atribuyen a efectivo.
      </p>
      <div className="flex flex-wrap justify-between gap-3 border-b border-border pb-4">
        <span>Venta física estimada</span>
        <strong className="tabular-nums text-primary">
          {formatearPrecio(data.ventaFisicaEstimada)}
        </strong>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Medio</th>
              <th className="p-2 text-right">Esperado</th>
              <th className="p-2 text-right">Declarado</th>
              <th className="p-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                nombre: 'Efectivo sin base',
                esperado: Number(data.efectivo.esperadoSinBase),
                real: efectivo,
              },
              {
                nombre: 'Transferencias / Nequi (neto)',
                esperado: Number(data.transferencia.esperado),
                real: digital,
              },
              {
                nombre: 'Tarjeta',
                esperado: Number(data.tarjeta.esperado),
                real: tarjeta,
              },
            ].map((f) => (
              <tr key={f.nombre} className="border-t border-border">
                <td className="py-3">{f.nombre}</td>
                <td className="p-2 text-right tabular-nums">
                  {formatearPrecio(f.esperado)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {f.real === null ? 'Sin declarar' : formatearPrecio(f.real)}
                </td>
                <td
                  className={cn(
                    'p-2 text-right tabular-nums',
                    f.real !== null &&
                      (f.real < f.esperado
                        ? 'text-destructive'
                        : 'text-tertiary'),
                  )}
                >
                  {f.real === null
                    ? 'No comparable'
                    : `${f.real < f.esperado ? 'Faltante' : f.real > f.esperado ? 'Sobrante' : 'Exacto'} ${formatearPrecio(Math.abs(f.real - f.esperado))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Se suma lo declarado en cada turno, incluido el dinero retirado al
        cambiar de cajero, excluyendo cada base de $300.000. Un turno antiguo
        sin declaración digital deja ese medio sin comparar.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Ver cálculo por producto ({data.detalle.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[35rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Producto</th>
                <th className="p-2 text-right">Inicial</th>
                <th className="p-2 text-right">Entradas</th>
                <th className="p-2 text-right">Final</th>
                <th className="p-2 text-right">Ventas estimadas</th>
                <th className="p-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.detalle.map((d) => (
                <tr key={d.articuloId} className="border-t border-border">
                  <td className="py-2">{d.nombre}</td>
                  <td className="p-2 text-right tabular-nums">{d.inicial}</td>
                  <td className="p-2 text-right tabular-nums">{d.entradas}</td>
                  <td className="p-2 text-right tabular-nums">{d.final}</td>
                  <td className="p-2 text-right tabular-nums">{d.unidades}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatearPrecio(d.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
