import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Nueva version de ConfiguracionPropinas (desactiva la anterior). Si retieneCasa
// es true, porcentajeCasa es obligatorio (se valida en el service).
export class UpdatePropinasConfigDto {
  @IsBoolean()
  retieneCasa!: boolean;

  // Porcentaje del pool de propinas que retiene el restaurante (ej. 10 = 10%).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  porcentajeCasa?: number;
}
