import { IsArray, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { MetodoReparto } from '../propinas.service';

export class RepartirPropinasDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;

  @IsIn(['IGUALES', 'PRESENCIA'])
  metodo!: MetodoReparto;

  // Solo aplica a IGUALES: empleados a excluir del reparto.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  excluidos?: number[];

  // Retencion del local aplicada a ESTE reparto (lo que ve el ADMIN en pantalla).
  // Si no viene, se usa la config guardada.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pctCasa?: number;
}
