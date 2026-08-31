import {
  fechaLocalSinHora,
  horaAMinutos,
  tiempoDbAMinutos,
  minutosATiempoDb,
  horasEnFranjaNocturna,
} from './fechas';

// Los helpers de fechas alimentan el recargo nocturno y el dia @db.Date de las
// jornadas. Las entradas se construyen con el constructor LOCAL de Date
// (new Date(y, m, d, h)) para que las pruebas den igual en cualquier zona del
// runner; las conversiones @db.Time usan getters UTC, asi que son estables.

describe('horaAMinutos', () => {
  it('convierte HH:MM a minutos del dia', () => {
    expect(horaAMinutos('00:00')).toBe(0);
    expect(horaAMinutos('06:00')).toBe(360);
    expect(horaAMinutos('22:30')).toBe(1350);
    expect(horaAMinutos('23:59')).toBe(1439);
  });
});

describe('tiempoDbAMinutos / minutosATiempoDb', () => {
  it('hacen ida y vuelta sin depender de la zona (usan UTC)', () => {
    expect(tiempoDbAMinutos(minutosATiempoDb('06:00'))).toBe(360);
    expect(tiempoDbAMinutos(minutosATiempoDb('22:00'))).toBe(1320);
    expect(tiempoDbAMinutos(minutosATiempoDb('00:00'))).toBe(0);
  });

  it('minutosATiempoDb guarda la hora en la base 1970-01-01 UTC', () => {
    expect(minutosATiempoDb('22:00').toISOString()).toBe('1970-01-01T22:00:00.000Z');
  });
});

describe('fechaLocalSinHora', () => {
  it('devuelve el dia local como medianoche UTC (para columnas @db.Date)', () => {
    // 8pm local del 12/07 sigue siendo el dia 12 (en UTC ya seria el 13).
    expect(fechaLocalSinHora(new Date(2026, 6, 12, 20, 30)).toISOString()).toBe('2026-07-12T00:00:00.000Z');
    expect(fechaLocalSinHora(new Date(2026, 0, 1, 0, 0)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('horasEnFranjaNocturna', () => {
  // Franja tipica que cruza medianoche: 22:00 -> 06:00.
  const NOCHE_INICIO = 1320; // 22:00
  const NOCHE_FIN = 360; // 06:00

  it('cuenta ambos tramos cuando la jornada cruza la medianoche (20:00 -> 02:00 = 4h)', () => {
    const horas = horasEnFranjaNocturna(
      new Date(2026, 0, 10, 20, 0),
      new Date(2026, 0, 11, 2, 0),
      NOCHE_INICIO,
      NOCHE_FIN,
    );
    expect(horas).toBeCloseTo(4, 5); // 22-24 (2h) + 00-02 (2h)
  });

  it('cuenta la jornada nocturna completa 23:00 -> 05:00 = 6h', () => {
    const horas = horasEnFranjaNocturna(
      new Date(2026, 0, 10, 23, 0),
      new Date(2026, 0, 11, 5, 0),
      NOCHE_INICIO,
      NOCHE_FIN,
    );
    expect(horas).toBeCloseTo(6, 5); // 23-24 (1h) + 00-05 (5h)
  });

  it('cuenta solo el solapamiento parcial con el tramo de la noche (21:00 -> 23:00 = 1h)', () => {
    const horas = horasEnFranjaNocturna(
      new Date(2026, 0, 10, 21, 0),
      new Date(2026, 0, 10, 23, 0),
      NOCHE_INICIO,
      NOCHE_FIN,
    );
    expect(horas).toBeCloseTo(1, 5); // solo 22-23
  });

  it('devuelve 0 cuando la jornada es totalmente diurna (10:00 -> 16:00)', () => {
    const horas = horasEnFranjaNocturna(
      new Date(2026, 0, 10, 10, 0),
      new Date(2026, 0, 10, 16, 0),
      NOCHE_INICIO,
      NOCHE_FIN,
    );
    expect(horas).toBe(0);
  });

  it('soporta una franja que NO cruza medianoche (00:00 -> 06:00)', () => {
    const horas = horasEnFranjaNocturna(
      new Date(2026, 0, 10, 1, 0),
      new Date(2026, 0, 10, 4, 0),
      0, // 00:00
      360, // 06:00
    );
    expect(horas).toBeCloseTo(3, 5);
  });
});
