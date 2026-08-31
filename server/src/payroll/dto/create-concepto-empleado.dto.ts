import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

// Aplicacion manual de un concepto a un empleado (incentivo, bono,
// descuento por prestamo...). Los automaticos por dia trabajado NO pasan
// por aqui: los genera el cierre de jornada.
export class CreateConceptoEmpleadoDto {
  @IsInt()
  idConcepto!: number;

  // Multiplicador del valor vigente (ej. 2 auxilios); por defecto 1.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  cantidad?: number;

  // Solo dia (YYYY-MM-DD); si se omite, hoy.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  observacion?: string;
}
