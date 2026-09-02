import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  ModalidadCuentaPedido,
  TipoPedido,
} from '../../generated/prisma/client';

// Un pedido es LOCAL (por defecto) o DOMICILIO. El pedido LOCAL nace sin
// ficha: el cajero se la asigna al cobrar o al autorizar el envio sin pago.
// mesero_pedido NO va aqui: sale del usuario autenticado (JWT), nunca del body,
// para que no se pueda abrir un pedido "a nombre de" otro mesero.
export class CreatePedidoDto {
  @IsOptional()
  @IsEnum(TipoPedido)
  tipo?: TipoPedido;

  @IsOptional()
  @IsEnum(ModalidadCuentaPedido)
  modalidadCuenta?: ModalidadCuentaPedido;

  @ValidateIf(
    (o: CreatePedidoDto) =>
      o.modalidadCuenta === ModalidadCuentaPedido.POR_CUENTA,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  nombresCuentas?: string[];

  // Datos de entrega: requeridos solo para DOMICILIO, ignorados en pedidos locales.
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
