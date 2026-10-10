import { Prisma } from '../generated/prisma/client';
type Valor = string | number | Prisma.Decimal;
export function calcularDescuadreInventario(d: {
  ventaFisica: Valor;
  ventaTransferencia: Valor;
  ventaTarjeta: Valor;
  ingresosEfectivo: Valor;
  egresosEfectivo: Valor;
  ingresosTransferencia: Valor;
  egresosTransferencia: Valor;
  realEfectivoSinBase: Valor;
  realTransferencia: Valor | null;
  realTarjeta: Valor | null;
}) {
  const dec = (v: Valor) => new Prisma.Decimal(v);
  const esperadoEfectivo = dec(d.ventaFisica)
    .minus(d.ventaTransferencia)
    .minus(d.ventaTarjeta)
    .plus(d.ingresosEfectivo)
    .minus(d.egresosEfectivo);
  const esperadoTransferencia = dec(d.ventaTransferencia)
    .plus(d.ingresosTransferencia)
    .minus(d.egresosTransferencia);
  const diferencia = (real: Valor | null, esperado: Prisma.Decimal) =>
    real === null ? null : dec(real).minus(esperado).toString();
  return {
    ventaFisicaEstimada: dec(d.ventaFisica).toString(),
    efectivo: {
      esperadoSinBase: esperadoEfectivo.toString(),
      realSinBase: dec(d.realEfectivoSinBase).toString(),
      diferencia: diferencia(d.realEfectivoSinBase, esperadoEfectivo),
    },
    transferencia: {
      esperado: esperadoTransferencia.toString(),
      real:
        d.realTransferencia === null
          ? null
          : dec(d.realTransferencia).toString(),
      diferencia: diferencia(d.realTransferencia, esperadoTransferencia),
    },
    tarjeta: {
      esperado: dec(d.ventaTarjeta).toString(),
      real: d.realTarjeta === null ? null : dec(d.realTarjeta).toString(),
      diferencia: diferencia(d.realTarjeta, dec(d.ventaTarjeta)),
    },
  };
}
