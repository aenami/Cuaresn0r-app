import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarHorarioDto } from './dto/registrar-horario.dto';
import { validarHorario } from './horario';

const tramo = (entrada: string, salida: string) => ({
  entrada: `2026-10-07T${entrada}:00-05:00`,
  salida: `2026-10-07T${salida}:00-05:00`,
});
const dto = (tramos = [tramo('07:00', '12:00')]): RegistrarHorarioDto => ({
  idEmpleado: 1,
  fecha: '2026-10-07',
  tramos,
});
const ahora = Date.parse('2026-10-09T12:00:00-05:00');

describe('Horarios manuales de asistencia', () => {
  it('acepta un horario completo', () => {
    const horario = validarHorario(dto(), ahora);
    expect(horario.fecha.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(
      horario.tramos[0].salida.getTime() - horario.tramos[0].entrada.getTime(),
    ).toBe(5 * 3600000);
  });
  it('ordena turnos partidos sin sumar el descanso', () => {
    const horario = validarHorario(
      dto([tramo('14:00', '18:30'), tramo('07:00', '12:00')]),
      ahora,
    );
    expect(
      horario.tramos.reduce(
        (total, t) =>
          total + (t.salida.getTime() - t.entrada.getTime()) / 3600000,
        0,
      ),
    ).toBe(9.5);
    expect(horario.tramos[0].entrada.toISOString()).toBe(
      '2026-10-07T12:00:00.000Z',
    );
  });
  it('admite medianoche y conserva la fecha de Colombia', () => {
    const horario = validarHorario(
      dto([
        {
          entrada: '2026-10-07T22:00:00-05:00',
          salida: '2026-10-08T02:00:00-05:00',
        },
      ]),
      ahora,
    );
    expect(horario.fecha.toISOString().slice(0, 10)).toBe('2026-10-07');
  });
  it('admite tramos contiguos', () => {
    expect(
      validarHorario(
        dto([tramo('07:00', '12:00'), tramo('12:00', '16:00')]),
        ahora,
      ).tramos,
    ).toHaveLength(2);
  });
  it.each(['2026-02-30', '', '2026-2-03', 'invalid'])(
    'rechaza fecha inválida %s',
    (fecha) => {
      expect(() => validarHorario({ ...dto(), fecha }, ahora)).toThrow(
        BadRequestException,
      );
    },
  );
  it.each([
    { tramos: [] },
    { tramos: Array.from({ length: 13 }, () => tramo('07:00', '12:00')) },
  ])('exige entre 1 y 12 tramos', ({ tramos }) => {
    expect(() => validarHorario(dto(tramos), ahora)).toThrow(
      BadRequestException,
    );
  });
  it.each([
    tramo('12:00', '07:00'),
    tramo('07:00', '07:00'),
    { entrada: 'invalidZ', salida: 'invalidZ' },
    { entrada: '2026-10-07T07:00:00', salida: '2026-10-07T12:00:00' },
  ])('rechaza tramos inválidos %j', (t) => {
    expect(() => validarHorario(dto([t]), ahora)).toThrow(BadRequestException);
  });
  it('rechaza superposición', () => {
    expect(() =>
      validarHorario(
        dto([tramo('07:00', '12:00'), tramo('11:59', '16:00')]),
        ahora,
      ),
    ).toThrow(/superponerse/);
  });
  it('rechaza fechas futuras', () => {
    expect(() =>
      validarHorario(dto(), Date.parse('2026-10-07T11:00:00-05:00')),
    ).toThrow(/futuro/);
  });
  it('rechaza otra fecha de inicio aunque UTC coincida', () => {
    expect(() =>
      validarHorario({ ...dto(), fecha: '2026-10-08' }, ahora),
    ).toThrow(/Colombia/);
  });
  it('rechaza jornadas que abarcan más de 24 horas', () => {
    expect(() =>
      validarHorario(
        dto([
          {
            entrada: '2026-10-07T07:00:00-05:00',
            salida: '2026-10-08T07:01:00-05:00',
          },
        ]),
        ahora,
      ),
    ).toThrow(/24 horas/);
  });
  it('el DTO valida tramos anidados y exige zonas explícitas', async () => {
    expect(await validate(plainToInstance(RegistrarHorarioDto, dto()))).toEqual(
      [],
    );
    const errores = await validate(
      plainToInstance(RegistrarHorarioDto, {
        ...dto(),
        idEmpleado: 0,
        tramos: [{ entrada: '2026-10-07T07:00:00', salida: 'invalid' }],
      }),
    );
    expect(errores.map((e) => e.property)).toEqual(
      expect.arrayContaining(['idEmpleado', 'tramos']),
    );
  });
});
