import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MetodoPago,
  TipoArticuloPanaderia,
  UnidadIngrediente,
} from '../generated/prisma/client';

export class CrearArticuloPanaderiaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsEnum(TipoArticuloPanaderia)
  tipo!: TipoArticuloPanaderia;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @IsOptional()
  @IsEnum(UnidadIngrediente)
  unidad?: UnidadIngrediente;

  @IsInt()
  @Min(0)
  precioVenta!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99999999.9999)
  costoReferencia?: number | null;
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

export class InsumoRecetaPanaderiaDto {
  @IsInt()
  @Min(1)
  insumoId!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidadUnidad!: number;
}

export class CrearRecetaPanaderiaDto {
  @IsInt()
  @Min(1)
  articuloId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InsumoRecetaPanaderiaDto)
  detalles!: InsumoRecetaPanaderiaDto[];
}

export class ActualizarArticuloPanaderiaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoriaId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  precioVenta?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99999999.9999)
  costoReferencia?: number | null;

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

export class AgregarElementoConteoPanaderiaDto {
  @IsInt()
  @Min(1)
  articuloId!: number;
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

export class EntregaRemisionDto {
  @IsUUID() claveOperacion!: string;
  @IsIn(['TURNO', 'DIA']) modalidad!: 'TURNO' | 'DIA';
  @IsInt() @Min(1) articuloId!: number;
  @IsInt() @Min(1) ingredienteDestinoId!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsInt() @Min(1) precioUnitario!: number;
  @IsString() @IsNotEmpty() @MaxLength(150) concepto!: string;
}

export class LineaRemisionDto {
  @IsUUID() claveOperacion!: string;
  @IsOptional() @IsInt() @Min(1) articuloId?: number;
  @IsOptional() @IsInt() @Min(1) ingredienteDestinoId?: number;
  @IsOptional() @IsInt() @Min(1) ingredienteOrigenId?: number;
  @IsOptional() @IsInt() @Min(1) articuloDestinoId?: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsInt() @Min(1) precioUnitario!: number;
  @IsString() @IsNotEmpty() @MaxLength(150) concepto!: string;
}
export class EntregaListaRemisionDto {
  @IsIn(['TURNO', 'DIA']) modalidad!: 'TURNO' | 'DIA';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaRemisionDto)
  lineas!: LineaRemisionDto[];
}
export class EditarLineaRemisionDto {
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad!: number;
  @IsInt() @Min(1) precioUnitario!: number;
  @IsString() @IsNotEmpty() @MaxLength(150) concepto!: string;
}
