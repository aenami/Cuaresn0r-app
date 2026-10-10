export interface ValoracionConteo {
  version: number
  estado: 'VALIDA' | 'NO_COMPARABLE' | 'SIN_REFERENCIA' | 'PENDIENTE' | 'RECONTAR' | 'SIN_VALORACION_HISTORICA'
  tipoReferencia: 'PRECIO_VENTA' | 'COSTO_UNITARIO'
  precioReferencia: string | null
  nombre: string
  unidad: string
  fechaValoracion: string | null
  salidaFisicaEstimada: string
  cantidadReconocida: string
  cantidadFaltante: string
  cantidadSobrante: string
  ingresoEstimado: string | null
  costoConsumido: string | null
  perdidaEstimada: string | null
  valorSobrante: string | null
  motivo?: string
}

interface ResumenValoracionMensual {
  mes: string
  area: 'RESTAURANTE' | 'PANADERIA'
  filas: {
    tipo: string
    tipoReferencia: 'PRECIO_VENTA' | 'COSTO_UNITARIO'
    idObjetivo: number
    nombre: string
    unidad: string
    diasValorados: number
    ingresoEstimado: string
    costoConsumido: string
    perdidaEstimada: string
    valorSobrante: string
  }[]
  totales: {
    ingresoEstimado: string
    costoConsumido: string
    perdidaEstimada: string
    valorSobrante: string
    perdidaProductos: string
    perdidaIngredientes: string
    sobranteProductos: string
    sobranteIngredientes: string
  }
  excluidos: {
    sinValoracion: number
    pendientes: number
    noComparables: number
    sinReferencia: number
    recontar: number
  }
}

export interface ResumenValoracionRango extends Omit<ResumenValoracionMensual, 'mes'> {
  desde: string
  hasta: string
}
