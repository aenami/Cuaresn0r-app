import { Request } from 'express';
import { AuthTokenPayload } from '../../common/token/token.service';
import { AreaNegocio } from '../../generated/prisma/client';

export interface AuthenticatedRequest extends Request {
  user: AuthTokenPayload;
  areaSeleccionada?: AreaNegocio;
}
