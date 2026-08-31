import { IsNumber, IsOptional, IsPositive, Matches } from 'class-validator';

// Cada cambio crea una NUEVA version (desactiva la vigente); nunca se edita
// la tarifa existente, para que los devengos historicos conserven contexto.
export class CreateTarifaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorHora!: number;

  // Solo dia (YYYY-MM-DD); si se omite, rige desde hoy.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaInicio debe tener formato YYYY-MM-DD' })
  fechaInicio?: string;
}
