import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PagosNominaService } from './pagos-nomina.service';
import { JornadasService } from './jornadas.service';
import { TarifasService } from './tarifas.service';
import { NominaConfigService } from './nomina-config.service';

@Injectable()
export class MiNominaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagosNominaService: PagosNominaService,
    private readonly jornadasService: JornadasService,
    private readonly tarifasService: TarifasService,
    private readonly nominaConfigService: NominaConfigService,
  ) {}

  // Autoservicio: la vista de solo lectura que el empleado tiene de SU propia
  // nomina. Se resuelve el empleado a partir del usuario del JWT (nunca de un
  // parametro), y se componen los mismos metodos que usa el ADMIN pero acotados
  // a ese empleado: saldo con el desglose de devengos, jornadas, historial de
  // pagos recibidos y la tarifa vigente. No expone nada de otros empleados.
  async resumen(idUsuario: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: idUsuario },
      select: { id_empleado_usuario: true },
    });
    // El JwtAuthGuard ya valido que el usuario existe y su empleado esta ACTIVO;
    // este chequeo es defensivo.
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    const idEmpleado = usuario.id_empleado_usuario;

    const [empleado, saldo, jornadas, pagos, tarifas, config] = await Promise.all([
      this.prisma.empleado.findUniqueOrThrow({ where: { id_empleado: idEmpleado } }),
      this.pagosNominaService.saldo(idEmpleado),
      this.jornadasService.findAll(idEmpleado),
      this.pagosNominaService.findByEmpleado(idEmpleado),
      this.tarifasService.findByEmpleado(idEmpleado),
      this.nominaConfigService.findActiva(),
    ]);

    return {
      empleado,
      saldo: {
        totalDevengado: saldo.totalDevengado,
        totalPagado: saldo.totalPagado,
        saldoPendiente: saldo.saldoPendiente,
        devengos: saldo.devengos,
      },
      jornadas,
      pagos,
      tarifaActiva: tarifas.find((t) => t.tarifa_activa) ?? null,
      // El recargo nocturno es global (config activa); se expone solo el
      // porcentaje para que el empleado vea su valor/hora nocturno.
      recargoNocturno:
        config.aplica_recargo_nocturno && config.porcentaje_recargo_nocturno !== null
          ? { porcentaje: config.porcentaje_recargo_nocturno }
          : null,
    };
  }
}
