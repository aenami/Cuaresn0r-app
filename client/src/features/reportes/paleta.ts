import type { MetodoPago } from '@/types/api'

// Paleta de las graficas, alineada a los tokens del diseño (Kinetic Obsidian,
// --chart-1..5). Hex concretos porque Recharts pinta el fill como atributo SVG
// y ahi no resuelve var(--...).
export const COLORES = {
  naranja: '#FF9157',
  amarillo: '#FFE483',
  teal: '#5BC0B5',
  rojo: '#E5604A',
  gris: '#ADAAAA',
}

export const PALETA = [COLORES.naranja, COLORES.teal, COLORES.amarillo, COLORES.rojo, COLORES.gris]

export const COLOR_METODO: Record<MetodoPago, string> = {
  EFECTIVO: COLORES.naranja,
  TARJETA: COLORES.teal,
  TRANSFERENCIA: COLORES.amarillo,
}

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}
