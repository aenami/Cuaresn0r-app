import { IsNumber, Min } from 'class-validator';

export class FinalizeInventoryCountDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadFisica!: number;
}
