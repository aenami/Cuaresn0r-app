import { Prisma } from '../generated/prisma/client';
import { ConflictException } from '@nestjs/common';
import { disponiblePanaderia, exigirDisponible } from './stock-compartido';
describe('existencia disponible menos reservas', () => {
  const tx = {
    reservaPanaderia: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { cantidad: new Prisma.Decimal(7) } }),
    },
  } as unknown as Prisma.TransactionClient;
  it('descuenta las reservas del disponible sin modificar existencia física', async () => {
    expect(
      (await disponiblePanaderia(tx, 1, new Prisma.Decimal(10))).toString(),
    ).toBe('3');
  });
  it('impide que ventas o salidas usen lo ya reservado', async () => {
    await expect(
      exigirDisponible(tx, 1, new Prisma.Decimal(10), 4),
    ).rejects.toThrow(ConflictException);
    await expect(
      exigirDisponible(tx, 1, new Prisma.Decimal(10), 3),
    ).resolves.toBeUndefined();
  });
});
