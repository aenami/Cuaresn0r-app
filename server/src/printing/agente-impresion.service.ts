import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ResultadoTrabajoDto } from './dto/resultado-trabajo.dto';

@Injectable()
export class AgenteImpresionService {
  constructor(private readonly prisma: PrismaService) {}

  validarClave(clave?: string) {
    const esperada = process.env.PRINT_AGENT_KEY;
    if (!esperada || !clave) throw new UnauthorizedException('Clave del agente de impresion no configurada o ausente');
    const a = Buffer.from(esperada);
    const b = Buffer.from(clave);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Clave del agente invalida');
  }

  async reclamar() {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<Array<{ id_trabajoImpresion: number }>>`
        SELECT "id_trabajoImpresion"
        FROM "TrabajoImpresion"
        WHERE (
          "estado_trabajo" IN ('PENDIENTE', 'REINTENTO')
          AND "proximo_intento_trabajo" <= NOW()
        ) OR (
          "estado_trabajo" = 'EN_PROCESO'
          AND "bloqueado_hasta_trabajo" < NOW()
        )
        ORDER BY "fecha_creacion_trabajo" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!filas[0]) return null;

      const token = randomUUID();
      const bloqueoHasta = new Date(Date.now() + 90_000);
      const trabajo = await tx.trabajoImpresion.update({
        where: { id_trabajoImpresion: filas[0].id_trabajoImpresion },
        data: {
          estado_trabajo: 'EN_PROCESO',
          token_bloqueo_trabajo: token,
          bloqueado_hasta_trabajo: bloqueoHasta,
          intentos_trabajo: { increment: 1 },
          fecha_actualizacion_trabajo: new Date(),
        },
        include: { impresora: true },
      });

      return {
        id: trabajo.id_trabajoImpresion,
        token,
        tipo: trabajo.tipo_trabajo,
        destino: trabajo.destino_trabajo,
        contenidoBase64: Buffer.from(trabajo.contenido_escpos_trabajo).toString('base64'),
        impresora: {
          id: trabajo.impresora.id_impresora,
          nombre: trabajo.impresora.nombre_impresora,
          modelo: trabajo.impresora.modelo_impresora,
          dispositivo: trabajo.impresora.dispositivo_impresora,
        },
      };
    });
  }

  async reportar(idTrabajo: number, dto: ResultadoTrabajoDto) {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<Array<{ id_trabajoImpresion: number }>>`
        SELECT "id_trabajoImpresion" FROM "TrabajoImpresion"
        WHERE "id_trabajoImpresion" = ${idTrabajo} FOR UPDATE
      `;
      if (!filas[0]) throw new NotFoundException('Trabajo de impresion no encontrado');

      const trabajo = await tx.trabajoImpresion.findUniqueOrThrow({
        where: { id_trabajoImpresion: idTrabajo },
      });
      if (trabajo.estado_trabajo !== 'EN_PROCESO' || trabajo.token_bloqueo_trabajo !== dto.token) {
        throw new ConflictException('El trabajo ya no pertenece a este intento del agente');
      }

      const reintentable = !dto.exitoso && dto.reintentable !== false;
      const esperaSegundos = Math.min(300, 5 * 2 ** Math.min(trabajo.intentos_trabajo - 1, 6));
      const estado = dto.exitoso ? 'IMPRESA' : reintentable ? 'REINTENTO' : 'FALLIDA';

      const actualizado = await tx.trabajoImpresion.update({
        where: { id_trabajoImpresion: idTrabajo },
        data: {
          estado_trabajo: estado,
          ultimo_error_trabajo: dto.exitoso ? null : dto.error ?? 'Fallo no especificado por el agente',
          proximo_intento_trabajo: reintentable
            ? new Date(Date.now() + esperaSegundos * 1000)
            : trabajo.proximo_intento_trabajo,
          token_bloqueo_trabajo: null,
          bloqueado_hasta_trabajo: null,
          fecha_actualizacion_trabajo: new Date(),
        },
      });

      if (trabajo.id_impresionComanda_trabajo !== null) {
        await tx.impresionComanda.update({
          where: { id_impresionComanda: trabajo.id_impresionComanda_trabajo },
          data: {
            estado_impresion: estado,
            motivo_fallo: dto.exitoso ? null : dto.error ?? 'Fallo no especificado por el agente',
            intentos_impresion: { increment: 1 },
            fecha_actualizacion: new Date(),
          },
        });
      }

      return actualizado;
    });
  }

  resumen() {
    return this.prisma.trabajoImpresion.groupBy({
      by: ['estado_trabajo'],
      _count: { _all: true },
    });
  }
}
