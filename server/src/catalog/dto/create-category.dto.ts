import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean } from 'class-validator'

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
  @IsOptional()
  @IsString()
  description?: string;
  // A que impresora van las comandas de los productos de esta categoria
  // (default COCINA en el schema). GENERAL es exclusivo de impresoras: una
  // categoria siempre se prepara en un lugar concreto.
  @IsOptional()
  @IsIn(['COCINA', 'BARRA'])
  destino?: 'COCINA' | 'BARRA';
  // Categoria de adiciones: sus productos solo se ofrecen como adiciones (con
  // precio) al personalizar, no sueltos en el menu.
  @IsOptional()
  @IsBoolean()
  esAdicion?: boolean;
}
