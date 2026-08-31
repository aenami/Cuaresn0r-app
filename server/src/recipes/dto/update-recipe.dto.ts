import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateRecipeDto } from './create-recipe.dto';

// id_product_recipe no es editable: cambiar de producto es una receta nueva
// (POST), no una version distinta de esta. Ver RecipesService: "update" en
// realidad desactiva esta version e inserta una nueva activa para el mismo
// producto (nunca se hace UPDATE sobre una receta existente).
export class UpdateRecipeDto extends PartialType(OmitType(CreateRecipeDto, ['id_product_recipe'] as const)) {}
