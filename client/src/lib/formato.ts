const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

// Los montos llegan del backend como string (Prisma Decimal serializado).
export function formatearPrecio(valor: string | number): string {
  return formatoCOP.format(Number(valor))
}

// Cantidades de inventario/recetas: hasta 4 decimales sin ceros de relleno.
export function formatearCantidad(valor: string | number): string {
  return Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 4 })
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

// Fecha corta: "12 oct 2023".
export function formatearFecha(iso: string): string {
  return formatoFecha.format(new Date(iso))
}
