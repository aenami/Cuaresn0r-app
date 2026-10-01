import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

// SALIDA_RECETA y REVERSO quedan afuera a proposito: solo los genera
// automaticamente el modulo Orders (InventoryService.descontarPorReceta /
// revertirPorDetalleComanda), nunca este endpoint manual.
export enum TipoMovimientoManual {
  ENTRADA = 'ENTRADA',
  MERMA = 'MERMA',
  SALIDA_MANUAL = 'SALIDA_MANUAL',
  AJUSTE_POSITIVO = 'AJUSTE_POSITIVO',
  AJUSTE_NEGATIVO = 'AJUSTE_NEGATIVO',
}

export class CreateMovementDto {
  @IsEnum(TipoMovimientoManual)
  tipo!: TipoMovimientoManual;

  @IsNumber()
  @IsPositive()
  cantidad!: number;

  // Obligatorio a nivel de aplicacion para las salidas y AJUSTE_*.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  motivo?: string;
}
