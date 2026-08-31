// Helpers de fechas para nomina. Supuesto documentado (seccion 20 de la
// spec): el servidor corre en la zona horaria del restaurante, asi que los
// componentes locales de un Date representan la hora "de pared" del negocio.

// Dia local de un instante, como medianoche UTC: es lo que hay que guardar
// en columnas @db.Date para que el dia no se corra (a las 8pm de Colombia,
// en UTC ya es manana).
export function fechaLocalSinHora(instante: Date): Date {
  return new Date(Date.UTC(instante.getFullYear(), instante.getMonth(), instante.getDate()));
}

// "HH:MM" -> minutos del dia (la franja nocturna se define asi).
export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Columna @db.Time de Prisma (Date con base 1970-01-01 UTC) -> minutos del dia.
export function tiempoDbAMinutos(tiempo: Date): number {
  return tiempo.getUTCHours() * 60 + tiempo.getUTCMinutes();
}

// "HH:MM" -> Date que Prisma guarda en una columna @db.Time.
export function minutosATiempoDb(hora: string): Date {
  return new Date(`1970-01-01T${hora}:00.000Z`);
}

// Horas del intervalo [inicio, fin] que caen dentro de la franja nocturna
// (en minutos del dia local; puede cruzar medianoche, ej. 22:00 -> 06:00).
// Se recorre cada dia calendario tocado por el intervalo y se suman los
// solapamientos contra las ventanas nocturnas de ese dia (seccion 12).
export function horasEnFranjaNocturna(inicio: Date, fin: Date, inicioMin: number, finMin: number): number {
  let total = 0;
  let dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  while (dia.getTime() < fin.getTime()) {
    const t0 = dia.getTime();
    const diaSiguiente = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
    const ventanas: [number, number][] =
      inicioMin < finMin
        ? [[t0 + inicioMin * 60000, t0 + finMin * 60000]]
        : [
            [t0, t0 + finMin * 60000],
            [t0 + inicioMin * 60000, diaSiguiente.getTime()],
          ];
    for (const [desde, hasta] of ventanas) {
      const a = Math.max(inicio.getTime(), desde);
      const b = Math.min(fin.getTime(), hasta);
      if (b > a) total += (b - a) / 3600000;
    }
    dia = diaSiguiente;
  }
  return total;
}
