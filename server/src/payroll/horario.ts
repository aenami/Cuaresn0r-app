import { BadRequestException } from '@nestjs/common';
import { RegistrarHorarioDto } from './dto/registrar-horario.dto';

export function validarHorario(dto: RegistrarHorarioDto, ahora = Date.now()) {
  const fecha = new Date(`${dto.fecha}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dto.fecha) ||
    !Number.isFinite(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== dto.fecha
  )
    throw new BadRequestException('La fecha de la jornada no es válida');
  if (
    !Array.isArray(dto.tramos) ||
    !dto.tramos.length ||
    dto.tramos.length > 12
  )
    throw new BadRequestException('Registra entre 1 y 12 tramos de horario');
  const tramos = dto.tramos
    .map((tramo) => {
      if (
        ![tramo.entrada, tramo.salida].every(
          (valor) =>
            typeof valor === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(valor),
        )
      )
        throw new BadRequestException(
          'Las horas deben incluir su zona horaria',
        );
      const entrada = new Date(tramo.entrada);
      const salida = new Date(tramo.salida);
      if (
        !Number.isFinite(entrada.getTime()) ||
        !Number.isFinite(salida.getTime()) ||
        salida <= entrada
      )
        throw new BadRequestException(
          'Cada salida debe ser posterior a su entrada',
        );
      if (salida.getTime() > ahora)
        throw new BadRequestException(
          'No se pueden confirmar horarios en el futuro',
        );
      return { entrada, salida };
    })
    .sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
  const diaEntrada = new Date(tramos[0].entrada.getTime() - 5 * 3600000)
    .toISOString()
    .slice(0, 10);
  if (diaEntrada !== dto.fecha)
    throw new BadRequestException(
      'El primer tramo debe iniciar en la fecha de la jornada en Colombia',
    );
  if (
    tramos.at(-1)!.salida.getTime() - tramos[0].entrada.getTime() >
    24 * 3600000
  )
    throw new BadRequestException(
      'El horario completo no puede abarcar más de 24 horas',
    );
  for (let i = 1; i < tramos.length; i++) {
    if (tramos[i].entrada < tramos[i - 1].salida)
      throw new BadRequestException(
        'Los tramos de horario no pueden superponerse',
      );
  }
  return { fecha, tramos };
}
