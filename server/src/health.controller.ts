import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

// Endpoint publico de liveness: lo usa el health check de Render y sirve para
// verificar de un vistazo que el backend responde. No toca la base de datos.
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  estado() {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
