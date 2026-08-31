import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateIngredientDto } from './create-ingredient.dto';

// stock no es editable aqui: es un valor cacheado que solo cambia via
// InventoryService (movimientos de inventario), nunca con un PATCH directo.
export class UpdateIngredientDto extends PartialType(OmitType(CreateIngredientDto, ['stock'] as const)) {}
