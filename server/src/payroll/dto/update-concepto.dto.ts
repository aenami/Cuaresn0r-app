import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateConceptoDto } from './create-concepto.dto';

// tipo no se puede cambiar: los devengos historicos ya quedaron con el signo
// de INGRESO/DEDUCCION aplicado. valorInicial tampoco (los valores se
// versionan via POST /payroll/conceptos/:id/valores).
export class UpdateConceptoDto extends PartialType(OmitType(CreateConceptoDto, ['tipo', 'valorInicial'])) {}
