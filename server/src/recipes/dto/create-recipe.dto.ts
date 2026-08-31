import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';

export class RecipeIngredientDto {
  @IsInt()
  id_ingredient!: number;

  @IsNumber()
  @IsPositive()
  quantity_ingredient!: number;
}

export class CreateRecipeDto {
  @IsInt()
  id_product_recipe!: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];
}
