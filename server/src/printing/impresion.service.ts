import { Injectable, NotFoundException } from '@nestjs/common';
import { DestinoImpresion, Impresora } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMANDA_PARA_IMPRESION,
  ComandaParaImpresion,
  FACTURA_PARA_IMPRESION,
  TicketBuilderService,
  destinosDeComanda,
} from './ticket-builder.service';

function nombreUsuario(
  usuario:
    | { email_usuario: string; empleado: { nombre_empleado: string; apellido_empleado: string } | null }
    | null
    | undefined,
): string | null {
  if (!usuario) return null;
  if (usuario.empleado) return `${usuario.empleado.nombre_empleado} ${usuario.empleado.apellido_empleado}`.trim();
  return usuario.email_usuario;
}

@Injectable()
export class ImpresionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketBuilder: TicketBuilderService,
  ) {}

  async imprimirComanda(idComanda: number, reimpresion = false, soloDestino?: DestinoImpresion) {
    const impresoras = await this.prisma.impresora.findMany({ where: { impresora_activa: true } });
    if (impresoras.length === 0) return [];

    const comanda = await this.prisma.comanda.findUnique({
      where: { id_comanda: idComanda },
      include: COMANDA_PARA_IMPRESION,
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');

    const destinos = destinosDeComanda(comanda).filter((destino) => soloDestino === undefined || destino === soloDestino);
    const resultados = [];
    for (const destino of destinos) {
      resultados.push(await this.encolarComanda(comanda, destino, impresoras, reimpresion));
    }
    return resultados;
  }

  async imprimirFactura(idFactura: number) {
    const factura = await this.prisma.factura.findUnique({
      where: { id_factura: idFactura },
      include: FACTURA_PARA_IMPRESION,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');

    const impresoras = await this.prisma.impresora.findMany({ where: { impresora_activa: true } });
    const impresora = impresoras.find((item) => item.destino_impresora === 'GENERAL') ?? impresoras[0];
    if (!impresora) return { ok: false, motivo: 'No hay ninguna impresora activa configurada' };

    const negocio = await this.prisma.configuracionNegocio.findFirst({ where: { configuracion_activa: true } });
    const cajero = nombreUsuario(factura.pagos[0]?.turno.usuario);
    const contenido = this.ticketBuilder.armarTicketFactura(factura, negocio, cajero, impresora.ancho_papel_impresora);
    const trabajo = await this.prisma.trabajoImpresion.create({
      data: {
        clave_idempotencia_trabajo: `factura:${idFactura}:${Date.now()}`,
        tipo_trabajo: 'FACTURA',
        destino_trabajo: impresora.destino_impresora,
        id_impresora_trabajo: impresora.id_impresora,
        id_factura_trabajo: idFactura,
        contenido_escpos_trabajo: new Uint8Array(contenido),
      },
    });
    return { ok: true, enCola: true, idTrabajo: trabajo.id_trabajoImpresion };
  }

  async probarImpresora(idImpresora: number) {
    const impresora = await this.prisma.impresora.findUnique({ where: { id_impresora: idImpresora } });
    if (!impresora) throw new NotFoundException('Impresora no encontrada');

    const contenido = this.ticketBuilder.armarTicketPrueba(
      impresora.nombre_impresora,
      impresora.destino_impresora,
      impresora.ancho_papel_impresora,
    );
    const trabajo = await this.prisma.trabajoImpresion.create({
      data: {
        clave_idempotencia_trabajo: `prueba:${idImpresora}:${Date.now()}`,
        tipo_trabajo: 'PRUEBA',
        destino_trabajo: impresora.destino_impresora,
        id_impresora_trabajo: idImpresora,
        contenido_escpos_trabajo: new Uint8Array(contenido),
      },
    });
    return { ok: true, enCola: true, idTrabajo: trabajo.id_trabajoImpresion };
  }

  private async encolarComanda(
    comanda: ComandaParaImpresion,
    destino: DestinoImpresion,
    impresoras: Impresora[],
    reimpresion: boolean,
  ) {
    const registro = await this.prisma.impresionComanda.upsert({
      where: {
        id_comanda_impresion_destino_impresion: {
          id_comanda_impresion: comanda.id_comanda,
          destino_impresion: destino,
        },
      },
      create: { id_comanda_impresion: comanda.id_comanda, destino_impresion: destino },
      update: { estado_impresion: 'PENDIENTE', motivo_fallo: null, fecha_actualizacion: new Date() },
    });

    // En el montaje actual la impresora GENERAL recibe cocina y barra. Si se
    // agrega una tercera, la configuracion por destino toma precedencia.
    const impresora =
      impresoras.find((item) => item.destino_impresora === destino) ??
      impresoras.find((item) => item.destino_impresora === 'GENERAL');
    if (!impresora) {
      return this.prisma.impresionComanda.update({
        where: { id_impresionComanda: registro.id_impresionComanda },
        data: {
          estado_impresion: 'FALLIDA',
          motivo_fallo: `No hay impresora activa para ${destino} ni impresora GENERAL`,
          fecha_actualizacion: new Date(),
        },
      });
    }

    const contenido = this.ticketBuilder.armarTicketComanda(
      comanda,
      destino,
      impresora.ancho_papel_impresora,
      reimpresion,
    );
    const sufijo = reimpresion ? `reimpresion:${Date.now()}` : 'original';
    const trabajo = await this.prisma.trabajoImpresion.upsert({
      where: { clave_idempotencia_trabajo: `comanda:${comanda.id_comanda}:${destino}:${sufijo}` },
      create: {
        clave_idempotencia_trabajo: `comanda:${comanda.id_comanda}:${destino}:${sufijo}`,
        tipo_trabajo: 'COMANDA',
        destino_trabajo: destino,
        id_impresora_trabajo: impresora.id_impresora,
        id_impresionComanda_trabajo: registro.id_impresionComanda,
        contenido_escpos_trabajo: new Uint8Array(contenido),
      },
      update: {},
    });

    return { ...registro, idTrabajo: trabajo.id_trabajoImpresion };
  }
}
