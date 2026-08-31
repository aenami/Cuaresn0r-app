import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { TipoPedido } from '../../generated/prisma/client';

// Un pedido es de MESA (por defecto) o DOMICILIO.
//   - MESA:      idMesa obligatorio; sin datos de cliente.
//   - DOMICILIO: no ocupa mesa; nombre/telefono/direccion del cliente obligatorios.
// mesero_pedido NO va aqui: sale del usuario autenticado (JWT), nunca del body,
// para que no se pueda abrir un pedido "a nombre de" otro mesero.
export class CreatePedidoDto {
  @IsOptional()
  @IsEnum(TipoPedido)
  tipo?: TipoPedido;

  // Requerido salvo en domicilio (donde no hay mesa).
  @ValidateIf((o: CreatePedidoDto) => o.tipo !== TipoPedido.DOMICILIO)
  @IsInt()
  idMesa?: number;

  // Datos de entrega: requeridos solo para DOMICILIO, ignorados en pedidos de mesa.
  @ValidateIf((o: CreatePedidoDto) => o.tipo === TipoPedido.DOMICILIO)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombreCliente?: string;

  @ValidateIf((o: CreatePedidoDto) => o.tipo === TipoPedido.DOMICILIO)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefonoCliente?: string;

  @ValidateIf((o: CreatePedidoDto) => o.tipo === TipoPedido.DOMICILIO)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  direccionCliente?: string;
}
