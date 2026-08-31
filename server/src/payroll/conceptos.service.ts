import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConceptoDto } from './dto/create-concepto.dto';
import { UpdateConceptoDto } from './dto/update-concepto.dto';
import { CreateValorConceptoDto } from './dto/create-valor-concepto.dto';

// Catalogo de conceptos (auxilios, incentivos, deducciones) y sus valores
// versionados — patron catalogo/instancia igual que Combo/DetalleCombo.
// Sin delete: un concepto ya aplicado es historia de nomina.
@Injectable()
export class ConceptosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConceptoDto) {
    if (dto.aplicaAutomaticamente && dto.unidadCalculo === undefined) {
      throw new BadRequestException('Un concepto automatico requiere unidadCalculo (DIA_TRABAJADO)');
    }

    return this.prisma.$transaction(async (tx) => {
      const concepto = await tx.conceptoNomina.create({
        data: {
          nombre_conceptoNomina: dto.nombre,
          tipo_conceptoNomina: dto.tipo,
          aplica_automaticamente: dto.aplicaAutomaticamente ?? false,
          ...(dto.unidadCalculo !== undefined && { unidad_calculo_conceptoNomina: dto.unidadCalculo }),
        },
      });
      if (dto.valorInicial !== undefined) {
        await tx.valorConceptoNomina.create({
          data: { id_concepto_valorConceptoNomina: concepto.id_conceptoNomina, monto_valorConceptoNomina: dto.valorInicial },
        });
      }
      return tx.conceptoNomina.findUniqueOrThrow({
        where: { id_conceptoNomina: concepto.id_conceptoNomina },
        include: { valores: { where: { valor_activo: true } } },
      });
    });
  }

  async findAll() {
    return this.prisma.conceptoNomina.findMany({
      include: { valores: { where: { valor_activo: true } } },
      orderBy: { id_conceptoNomina: 'asc' },
    });
  }

  async findOne(id: number) {
    const concepto = await this.prisma.conceptoNomina.findUnique({
      where: { id_conceptoNomina: id },
      include: { valores: { where: { valor_activo: true } } },
    });
    if (!concepto) throw new NotFoundException('Concepto de nomina no encontrado');
    return concepto;
  }

  async update(id: number, dto: UpdateConceptoDto) {
    const actual = await this.findOne(id);

    const aplicaria = dto.aplicaAutomaticamente ?? actual.aplica_automaticamente;
    const unidad = dto.unidadCalculo ?? actual.unidad_calculo_conceptoNomina;
    if (aplicaria && unidad === null) {
      throw new BadRequestException('Un concepto automatico requiere unidadCalculo (DIA_TRABAJADO)');
    }

    return this.prisma.conceptoNomina.update({
      where: { id_conceptoNomina: id },
      data: {
        ...(dto.nombre !== undefined && { nombre_conceptoNomina: dto.nombre }),
        ...(dto.aplicaAutomaticamente !== undefined && { aplica_automaticamente: dto.aplicaAutomaticamente }),
        ...(dto.unidadCalculo !== undefined && { unidad_calculo_conceptoNomina: dto.unidadCalculo }),
      },
      include: { valores: { where: { valor_activo: true } } },
    });
  }

  // Nueva version del valor (desactiva la vigente); lo ya aplicado conserva
  // su snapshot en valor_unitario_aplicado_cne.
  async crearValor(idConcepto: number, dto: CreateValorConceptoDto) {
    await this.findOne(idConcepto);
    return this.prisma.$transaction(async (tx) => {
      await tx.valorConceptoNomina.updateMany({
        where: { id_concepto_valorConceptoNomina: idConcepto, valor_activo: true },
        data: { valor_activo: false },
      });
      return tx.valorConceptoNomina.create({
        data: { id_concepto_valorConceptoNomina: idConcepto, monto_valorConceptoNomina: dto.monto },
      });
    });
  }

  async findValores(idConcepto: number) {
    await this.findOne(idConcepto);
    return this.prisma.valorConceptoNomina.findMany({
      where: { id_concepto_valorConceptoNomina: idConcepto },
      orderBy: { id_valorConceptoNomina: 'desc' },
    });
  }
}
