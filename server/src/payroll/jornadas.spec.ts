import { aPesoEntero } from './jornadas.service';
import { Prisma } from '../generated/prisma/client';

// El peso colombiano no tiene centavos: cada devengo se redondea al entero
// hacia "afuera" del cero (ceil en positivos; en negativos, mas negativo), asi
// el saldo pendiente siempre es un entero pagable sin dejar centavos colgando.
describe('aPesoEntero', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it('deja intactos los enteros', () => {
    expect(aPesoEntero(d('100')).toString()).toBe('100');
    expect(aPesoEntero(d('0')).toString()).toBe('0');
  });

  it('redondea hacia arriba cualquier fraccion positiva (favorece al empleado)', () => {
    expect(aPesoEntero(d('100.01')).toString()).toBe('101');
    expect(aPesoEntero(d('100.5')).toString()).toBe('101');
    expect(aPesoEntero(d('100.99')).toString()).toBe('101');
  });

  it('en negativos redondea alejandose del cero (deduccion sin centavos)', () => {
    expect(aPesoEntero(d('-100')).toString()).toBe('-100');
    expect(aPesoEntero(d('-100.01')).toString()).toBe('-101');
    expect(aPesoEntero(d('-100.99')).toString()).toBe('-101');
  });
});
