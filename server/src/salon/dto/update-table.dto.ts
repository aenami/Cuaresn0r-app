import { PartialType } from '@nestjs/mapped-types';
import { CreateTableDto } from './mesa.dto';

// Los cambios de estado_mesa (reservar, liberar, activar, desactivar) tienen
// reglas propias y van por endpoints dedicados, no por este update generico.
export class UpdateTableDto extends PartialType(CreateTableDto) {}
