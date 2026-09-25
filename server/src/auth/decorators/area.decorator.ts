import { SetMetadata } from '@nestjs/common';
import { AreaNegocio } from '../../generated/prisma/client';

export const AREA_KEY = 'business_area';
export const Area = (area: AreaNegocio | 'AMBAS') => SetMetadata(AREA_KEY, area);
