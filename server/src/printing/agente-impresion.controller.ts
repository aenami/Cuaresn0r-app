import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { AgenteImpresionService } from './agente-impresion.service';
import { ResultadoTrabajoDto } from './dto/resultado-trabajo.dto';

@Public()
@Controller('/printing/agent')
export class AgenteImpresionController {
  constructor(private readonly agente: AgenteImpresionService) {}

  @Post('reclamar')
  reclamar(@Headers('x-agent-key') clave?: string) {
    this.agente.validarClave(clave);
    return this.agente.reclamar();
  }

  @Post('trabajos/:id/resultado')
  reportar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResultadoTrabajoDto,
    @Headers('x-agent-key') clave?: string,
  ) {
    this.agente.validarClave(clave);
    return this.agente.reportar(id, dto);
  }

  @Get('health')
  health(@Headers('x-agent-key') clave?: string) {
    this.agente.validarClave(clave);
    return { ok: true };
  }
}
