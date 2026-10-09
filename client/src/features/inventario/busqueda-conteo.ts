export function coincideConteo(nombre: string, busqueda: string) {
  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-CO')
      .trim()
  return normalizar(nombre).includes(normalizar(busqueda))
}
