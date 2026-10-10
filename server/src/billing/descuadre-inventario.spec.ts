import { calcularDescuadreInventario } from './descuadre-inventario';
import { resumenConteo } from '../bakery/bakery.service';
import { Prisma } from '../generated/prisma/client';

describe('descuadre físico diario separado del POS', () => {
  const datos = {
    ventaFisica: 100000,
    ventaTransferencia: 20000,
    ventaTarjeta: 10000,
    ingresosEfectivo: 5000,
    egresosEfectivo: 30000,
    ingresosTransferencia: 15000,
    egresosTransferencia: 10000,
    realEfectivoSinBase: 45000,
    realTransferencia: 25000,
    realTarjeta: 10000,
  };
  it('separa efectivo, Nequi y tarjeta sin sumar bases ni inventar ventas', () => {
    const d = calcularDescuadreInventario(datos);
    expect(d.efectivo).toEqual({
      esperadoSinBase: '45000',
      realSinBase: '45000',
      diferencia: '0',
    });
    expect(d.transferencia.diferencia).toBe('0');
    expect(d.tarjeta.diferencia).toBe('0');
  });
  it('conserva signo de faltantes y sobrantes', () => {
    const d = calcularDescuadreInventario({
      ...datos,
      realEfectivoSinBase: 40000,
      realTransferencia: 30000,
    });
    expect(d.efectivo.diferencia).toBe('-5000');
    expect(d.transferencia.diferencia).toBe('5000');
  });
  it('no certifica dinero digital de turnos sin declaración histórica', () => {
    const d = calcularDescuadreInventario({
      ...datos,
      realTransferencia: null,
      realTarjeta: null,
    });
    expect(d.transferencia.diferencia).toBeNull();
    expect(d.tarjeta.real).toBeNull();
  });
  it('admite neto digital negativo por pagos superiores al ingreso', () => {
    const d = calcularDescuadreInventario({
      ...datos,
      egresosTransferencia: 50000,
      realTransferencia: -15000,
    });
    expect(d.transferencia.esperado).toBe('-15000');
    expect(d.transferencia.diferencia).toBe('0');
  });
  it('incluye entradas y excluye mermas, remisiones y salidas justificadas', () => {
    const dec = (n: number) => new Prisma.Decimal(n);
    const c = resumenConteo({
      cantidadInicial: dec(20),
      entradas: dec(15),
      cantidadFisica: dec(10),
      transferencias: dec(5),
      mermas: dec(2),
      salidasJustificadas: dec(3),
      ventasRegistradas: dec(12),
      precioReferencia: dec(2500),
    });
    expect(c.ventaFisicaEstimada).toBe('15');
    expect(c.diferenciaUnidades).toBe('3');
  });
});
