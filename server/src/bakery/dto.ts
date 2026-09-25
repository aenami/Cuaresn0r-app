import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MetodoPago, TipoArticuloPanaderia, UnidadIngrediente } from '../generated/prisma/client';

export class CrearArticuloPanaderiaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsEnum(TipoArticuloPanaderia)
  tipo!: TipoArticuloPanaderia;

  @IsOptional()
  @IsEnum(UnidadIngrediente)
  unidad?: UnidadIngrediente;

  @IsInt()
  @Min(0)
  precioVenta!: number;
}

export class EntradaPanaderiaDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  concepto!: string;
}

export class ActualizarArticuloPanaderiaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  precioVenta?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class LineaVentaPanaderiaDto {
  @IsInt()
  @Min(1)
  articuloId!: number;

  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class PagoPanaderiaDto {
  @IsEnum(MetodoPago)
  metodo!: MetodoPago;

  @IsInt()
  @Min(1)
  monto!: number;
}

export class CrearVentaPanaderiaDto {
  @IsUUID()
  claveOperacion!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaVentaPanaderiaDto)
  lineas!: LineaVentaPanaderiaDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PagoPanaderiaDto)
  pagos!: PagoPanaderiaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  concepto?: string;
}

export class RegistrarConteoPanaderiaDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadFisica!: number;
}

export class CrearTransferenciaPanaderiaDto {
  @IsUUID()
  claveOperacion!: string;

  @IsInt()
  @Min(1)
  articuloId!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsInt()
  @Min(1)
  precioUnitario!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  productoDestinoId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ingredienteDestinoId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  concepto!: string;
}

export class ConfirmarIngresoTransferenciaDto {
  @IsInt()
  @Min(1)
  pagoCuentaPorPagarId!: number;
}

export class CrearTransferenciaRestauranteDto {
  @IsUUID()
  claveOperacion!: string;

  @IsInt()
  @Min(1)
  ingredienteId!: number;

  @IsInt()
  @Min(1)
  articuloDestinoId!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad!: number;

  @IsInt()
  @Min(1)
  precioUnitario!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  concepto!: string;
}

export class PagarTransferenciaRestauranteDto {
  @IsIn(['EFECTIVO', 'TRANSFERENCIA'])
  metodo!: 'EFECTIVO' | 'TRANSFERENCIA';
}
