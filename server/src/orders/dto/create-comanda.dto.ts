import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNegative,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PersonalizacionIngredienteDto {
  @IsInt()
  idIngrediente!: number;

  // Las personalizaciones SOLO quitan ingredientes (delta negativo): un "extra"
  // gratis (delta positivo) desbalancearia inventario sin cobrar. Para agregar
  // mas de un ingrediente se usa una adicion (Producto con precio). El delta es
  // TOTAL para el item (no por unidad): quitar la cebolla de 2 hamburguesas que
  // llevan 0.05 kg c/u es delta -0.1.
  @IsNumber()
  @IsNegative()
  delta!: number;
}

// Personalizaciones para UN producto que compone un combo (ej. "la
// hamburguesa del combo sin cebolla"). Se aplican al hijo correspondiente.
export class PersonalizacionComboComponenteDto {
  @IsInt()
  idProducto!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PersonalizacionIngredienteDto)
  personalizaciones!: PersonalizacionIngredienteDto[];
}

// Una adicion es un Producto del catalogo (con precio y receta propia, ej.
// "Adicion de queso") que se liga como hijo del item principal: se cobra,
// descuenta inventario y en cocina/factura aparece pegada a su item.
export class AdicionDto {
  @IsInt()
  idProducto!: number;

  // Cantidad TOTAL de la adicion (no se multiplica por la cantidad del padre).
  @IsInt()
  @IsPositive()
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  indicaciones?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalizacionIngredienteDto)
  personalizaciones?: PersonalizacionIngredienteDto[];
}

export class ComandaItemDto {
  // Exactamente uno de idProducto / idCombo (se valida en ComandasService).
  @IsOptional()
  @IsInt()
  idProducto?: number;

  @IsOptional()
  @IsInt()
  idCombo?: number;

  @IsInt()
  @IsPositive()
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  indicaciones?: string;

  // Si se omite, el item va a la subcuenta "Cuenta principal" del pedido.
  @IsOptional()
  @IsInt()
  idSubcuenta?: number;

  // Solo aplica cuando el item es un producto directo (idProducto), no un combo.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalizacionIngredienteDto)
  personalizaciones?: PersonalizacionIngredienteDto[];

  // Solo aplica cuando el item es un combo (idCombo): personalizaciones de
  // ingredientes por producto componente del combo.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalizacionComboComponenteDto)
  componentes?: PersonalizacionComboComponenteDto[];

  // Adiciones cobradas ligadas a este item (producto o combo); heredan su
  // subcuenta.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdicionDto)
  adiciones?: AdicionDto[];
}

export class CreateComandaDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComandaItemDto)
  items!: ComandaItemDto[];
}
