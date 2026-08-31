import { Request } from 'express';
import { AuthTokenPayload } from '../../common/token/token.service';

export interface AuthenticatedRequest extends Request {
  user: AuthTokenPayload;
}
