import { IsBoolean, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

// Nueva version de ConfiguracionNomina (desactiva la anterior). Si
// aplicaRecargoNocturno es true, porcentaje y franja son obligatorios
// (se valida en el service).
export class UpdateNominaConfigDto {
  @IsBoolean()
  aplicaRecargoNocturno!: boolean;

  // Ej. 35 = las horas nocturnas se pagan a valor_hora * 1.35
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeRecargo?: number;

  // Hora local del restaurante, formato HH:MM (ej. "22:00").
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'horaInicio debe tener formato HH:MM' })
  horaInicio?: string;

  // Puede ser menor que horaInicio: la franja cruza medianoche (22:00-06:00).
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'horaFin debe tener formato HH:MM' })
  horaFin?: string;
}
