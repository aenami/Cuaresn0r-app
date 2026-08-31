import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CreateRecipeDto, RecipeIngredientDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { PrismaService } from '../prisma/prisma.service';

const WITH_DETALLES = {
  detalles: { include: { ingrediente: true } },
  producto: true,
} as const;

@Injectable()
export class RecipesService {
  constructor(private readonly prismaService: PrismaService) {}

  // -------------------- PRODUCTS ---------------------
  async findProduct(id: number) {
    return await this.prismaService.producto.findFirst({
      where: {
        id_producto: id,
      }
    })
  }

  private async assertIngredientsExist(ids: number[]) {
    const unicos = [...new Set(ids)];
    const ingredientes = await this.prismaService.ingrediente.findMany({ where: { id_ingrediente: { in: unicos } } });
    if (ingredientes.length !== unicos.length) {
      throw new UnprocessableEntityException('Uno o mas ingredientes de la receta no existen');
    }
  }

  // ------------------- RECIPES ---------------------

  // Nunca se hace UPDATE sobre una receta existente: siempre se desactiva la
  // version activa anterior (si hay) y se inserta una nueva activa. Esto
  // preserva el costeo historico de pedidos que ya usaron una version previa
  // (DetalleComanda.id_receta_usada_dc apunta a la version exacta que uso).
  private async createVersion(idProducto: number, nombre: string, ingredients: RecipeIngredientDto[]) {
    await this.assertIngredientsExist(ingredients.map((i) => i.id_ingredient));

    return this.prismaService.$transaction(async (tx) => {
      await tx.receta.updateMany({
        where: { id_producto_receta: idProducto, receta_activa: true },
        data: { receta_activa: false },
      });

      const receta = await tx.receta.create({
        data: {
          nombre_receta: nombre,
          id_producto_receta: idProducto,
          receta_activa: true,
        },
      });

      await tx.detalleReceta.createMany({
        data: ingredients.map((ingredient) => ({
          id_receta_detalleReceta: receta.id_receta,
          id_ingrediente_detalleReceta: ingredient.id_ingredient,
          cantidad_ingrediente_detalleReceta: ingredient.quantity_ingredient,
        })),
      });

      return tx.receta.findUniqueOrThrow({ where: { id_receta: receta.id_receta }, include: WITH_DETALLES });
    });
  }

  async create(createRecipeDto: CreateRecipeDto) {
    const producto = await this.findProduct(createRecipeDto.id_product_recipe);
    if (!producto) throw new UnprocessableEntityException('Producto asociado a la receta no existente');

    return this.createVersion(createRecipeDto.id_product_recipe, createRecipeDto.name, createRecipeDto.ingredients);
  }

  async findAll(soloActivas = true) {
    return this.prismaService.receta.findMany({
      where: soloActivas ? { receta_activa: true } : undefined,
      include: WITH_DETALLES,
      orderBy: { id_receta: 'desc' },
    });
  }

  async findOne(id: number) {
    const receta = await this.prismaService.receta.findUnique({ where: { id_receta: id }, include: WITH_DETALLES });
    if (!receta) throw new NotFoundException('Receta no encontrada');
    return receta;
  }

  // "Actualizar" = crear una nueva version activa para el mismo producto,
  // reusando nombre/ingredientes actuales para lo que no se envie en el DTO.
  async update(id: number, updateRecipeDto: UpdateRecipeDto) {
    const actual = await this.findOne(id);

    const nombre = updateRecipeDto.name ?? actual.nombre_receta;
    const ingredients =
      updateRecipeDto.ingredients ??
      actual.detalles.map((d) => ({
        id_ingredient: d.id_ingrediente_detalleReceta,
        quantity_ingredient: Number(d.cantidad_ingrediente_detalleReceta),
      }));

    return this.createVersion(actual.id_producto_receta, nombre, ingredients);
  }

  // Nunca se borra una version de receta (el historial de pedidos puede
  // seguir apuntando a ella); "eliminar" = desactivarla.
  async remove(id: number) {
    await this.findOne(id);
    return this.prismaService.receta.update({ where: { id_receta: id }, data: { receta_activa: false } });
  }
}
