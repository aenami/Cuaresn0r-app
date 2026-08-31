import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { PropinasService, MetodoReparto } from './propinas.service';
import { PropinasConfigService } from './propinas-config.service';
import { RepartirPropinasDto } from './dto/repartir-propinas.dto';
import { UpdatePropinasConfigDto } from './dto/update-propinas-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// El reparto de propinas lo gestiona el ADMIN.
@Roles('ADMIN')
@Controller('/payroll/propinas')
export class PropinasController {
  constructor(
    private readonly propinasService: PropinasService,
    private readonly propinasConfigService: PropinasConfigService,
  ) {}

  // Retencion del restaurante: config versionada (una activa). Rutas literales
  // /config, disjuntas del root (repartir/deshacer) y de /preview.
  @Get('config')
  configActiva() {
    return this.propinasConfigService.findActiva();
  }

  @Post('config')
  guardarConfig(@Body() dto: UpdatePropinasConfigDto) {
    return this.propinasConfigService.crearVersion(dto);
  }

  // Vista previa del reparto (no persiste). excluidos: ids separados por coma.
  // pctCasa: override opcional de la retencion del local para previsualizar en
  // vivo lo que el ADMIN esta ajustando (si no viene, se usa la config guardada).
  @Get('preview')
  preview(
    @Query('fecha') fecha: string,
    @Query('metodo') metodo: string,
    @Query('excluidos') excluidos?: string,
    @Query('pctCasa') pctCasa?: string,
  ) {
    const ids = excluidos
      ? excluidos.split(',').map((s) => Number(s)).filter((n) => Number.isInteger(n))
      : [];
    const m: MetodoReparto = metodo === 'PRESENCIA' ? 'PRESENCIA' : 'IGUALES';
    const override = pctCasa !== undefined && pctCasa !== '' ? Number(pctCasa) : undefined;
    return this.propinasService.preview(fecha, m, ids, override);
  }

  @Post()
  repartir(@Body() dto: RepartirPropinasDto) {
    return this.propinasService.repartir(dto.fecha, dto.metodo, dto.excluidos ?? [], dto.pctCasa);
  }

  @Delete()
  deshacer(@Query('fecha') fecha: string) {
    return this.propinasService.deshacer(fecha);
  }
}
