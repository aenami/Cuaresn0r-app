import { IsDateString, IsInt, IsOptional } from 'class-validator';

// No lleva tipo: el sistema alterna solo ENTRADA/SALIDA segun la ultima
// marcacion de la jornada abierta (la alternancia estricta de la seccion 11
// queda garantizada por construccion).
export class MarcarDto {
  @IsInt()
  idEmpleado!: number;

  // Solo para correcciones (ej. el empleado olvido marcar al llegar): debe
  // ser posterior a la ultima marcacion y no puede estar en el futuro.
  // Sin zona horaria se interpreta como hora local del restaurante.
  @IsOptional()
  @IsDateString()
  fechaHora?: string;
}
