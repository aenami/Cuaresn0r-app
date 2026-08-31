import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Socket } from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { DestinoImpresion, EstadoImpresion, Impresora } from '../generated/prisma/client';
import {
  COMANDA_PARA_IMPRESION,
  ComandaParaImpresion,
  FACTURA_PARA_IMPRESION,
  TicketBuilderService,
  destinosDeComanda,
} from './ticket-builder.service';

// Nombre para mostrar de un usuario: el del empleado si lo tiene, si no el email.
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

const TIMEOUT_CONEXION_MS = 4000;
const REINTENTOS = 2;
const ESPERA_ENTRE_REINTENTOS_MS = 600;

@Injectable()
export class ImpresionService {
  private readonly logger = new Logger(ImpresionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketBuilder: TicketBuilderService,
  ) {}

  // Punto de entrada al enviar una comanda (fire-and-forget desde Orders,
  // SIEMPRE despues de que la transaccion confirmo: si la impresora falla,
  // la comanda ya esta a salvo y se reimprime).
  async imprimirComanda(idComanda: number, reimpresion = false, soloDestino?: DestinoImpresion) {
    const impresoras = await this.prisma.impresora.findMany({ where: { impresora_activa: true } });
    // Sin ninguna impresora configurada la funcion esta apagada: no se
    // generan trabajos fallidos que nadie va a atender.
    if (impresoras.length === 0) return [];

    const comanda = await this.prisma.comanda.findUnique({
      where: { id_comanda: idComanda },
      include: COMANDA_PARA_IMPRESION,
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');

    const destinos = destinosDeComanda(comanda).filter(
      (d) => soloDestino === undefined || d === soloDestino,
    );

    const resultados = [];
    for (const destino of destinos) {
      resultados.push(await this.procesarDestino(comanda, destino, impresoras, reimpresion));
    }
    return resultados;
  }

  // Imprime el recibo de venta de una factura en la impresora del mostrador
  // (GENERAL; si no hay, la primera activa). No lleva registro de reintentos
  // como las comandas: es a demanda y se puede repetir.
  async imprimirFactura(idFactura: number) {
    const factura = await this.prisma.factura.findUnique({
      where: { id_factura: idFactura },
      include: FACTURA_PARA_IMPRESION,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada');

    const impresoras = await this.prisma.impresora.findMany({ where: { impresora_activa: true } });
    const impresora = impresoras.find((i) => i.destino_impresora === 'GENERAL') ?? impresoras[0];
    if (!impresora) {
      return { ok: false, motivo: 'No hay ninguna impresora activa configurada' };
    }

    const negocio = await this.prisma.configuracionNegocio.findFirst({ where: { configuracion_activa: true } });
    const cajero = nombreUsuario(factura.pagos[0]?.turno.usuario);

    const ticket = this.ticketBuilder.armarTicketFactura(factura, negocio, cajero, impresora.ancho_papel_impresora);
    try {
      await this.enviar(impresora, ticket);
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: this.textoDeError(error) };
    }
  }

  async probarImpresora(idImpresora: number) {
    const impresora = await this.prisma.impresora.findUnique({ where: { id_impresora: idImpresora } });
    if (!impresora) throw new NotFoundException('Impresora no encontrada');

    const ticket = this.ticketBuilder.armarTicketPrueba(
      impresora.nombre_impresora,
      impresora.destino_impresora,
      impresora.ancho_papel_impresora,
    );
    try {
      await this.enviar(impresora, ticket);
      return { ok: true };
    } catch (error) {
      return { ok: false, motivo: this.textoDeError(error) };
    }
  }

  private async procesarDestino(
    comanda: ComandaParaImpresion,
    destino: DestinoImpresion,
    impresoras: Impresora[],
    reimpresion: boolean,
  ) {
    // Una fila por (comanda, destino): reintentos y reimpresiones acumulan
    // sobre la misma, no crean historia duplicada.
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

    // Impresora especifica del destino; si no hay, la GENERAL (local con una
    // sola termica: recibe los tickets de cocina Y barra y el mesero reparte).
    const impresora =
      impresoras.find((i) => i.destino_impresora === destino) ??
      impresoras.find((i) => i.destino_impresora === 'GENERAL');
    if (!impresora) {
      return this.actualizarRegistro(
        registro.id_impresionComanda,
        'FALLIDA',
        `No hay impresora activa para ${destino} ni impresora GENERAL`,
        0,
      );
    }

    const ticket = this.ticketBuilder.armarTicketComanda(
      comanda,
      destino,
      impresora.ancho_papel_impresora,
      reimpresion,
    );

    let intentos = 0;
    let ultimoError = '';
    while (intentos <= REINTENTOS) {
      intentos++;
      try {
        await this.enviar(impresora, ticket);
        return this.actualizarRegistro(registro.id_impresionComanda, 'IMPRESA', null, intentos);
      } catch (error) {
        ultimoError = this.textoDeError(error);
        this.logger.warn(
          `Fallo impresion comanda ${comanda.id_comanda} (${destino}) intento ${intentos}: ${ultimoError}`,
        );
        if (intentos <= REINTENTOS) {
          await new Promise((r) => setTimeout(r, ESPERA_ENTRE_REINTENTOS_MS));
        }
      }
    }
    return this.actualizarRegistro(registro.id_impresionComanda, 'FALLIDA', ultimoError, intentos);
  }

  private actualizarRegistro(id: number, estado: EstadoImpresion, motivo: string | null, intentos: number) {
    return this.prisma.impresionComanda.update({
      where: { id_impresionComanda: id },
      data: {
        estado_impresion: estado,
        motivo_fallo: motivo,
        intentos_impresion: { increment: intentos },
        fecha_actualizacion: new Date(),
      },
    });
  }

  // Protocolo RAW 9100: abrir socket, escribir los bytes ESC/POS, cerrar.
  private enviar(impresora: Impresora, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let terminado = false;
      const finalizar = (error?: Error) => {
        if (terminado) return;
        terminado = true;
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };

      socket.setTimeout(TIMEOUT_CONEXION_MS);
      socket.on('timeout', () => finalizar(new Error(`Timeout conectando a ${impresora.host_impresora}:${impresora.puerto_impresora}`)));
      socket.on('error', (e) => finalizar(e));
      socket.connect(impresora.puerto_impresora, impresora.host_impresora, () => {
        socket.end(data, () => finalizar());
      });
    });
  }

  private textoDeError(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 200);
  }
}
