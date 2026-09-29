import type { SesionUsuario } from '@/stores/auth.store'

export type AreaTrabajo = 'RESTAURANTE' | 'PANADERIA'
export const esGlobal = (rol?: string) =>
  rol === 'ADMIN_GLOBAL' || rol === 'ADMIN'
export const esAdministrador = (rol?: string) =>
  esGlobal(rol) || rol === 'ADMIN_LOCAL'
export const puedeCobrar = (rol?: string) =>
  rol === 'CAJERO' || rol === 'ADMIN_LOCAL'
export const nombreRol = (rol: string) =>
  ({
    ADMIN: 'Administrador global',
    ADMIN_GLOBAL: 'Administrador global',
    ADMIN_LOCAL: 'Administrador local',
    CAJERO: 'Cajero',
    MESERO: 'Mesero',
    COCINERO: 'Cocinero',
    PANADERO: 'Panadero',
  })[rol] ?? rol
export const nombreArea = (area: AreaTrabajo) =>
  area === 'PANADERIA' ? 'Panadería' : 'Restaurante / cafetería'
export function rutaInicial(
  usuario: SesionUsuario | null,
): '/' | '/panaderia' | '/inventario' | '/mesas' {
  if (esAdministrador(usuario?.rolNombre)) return '/'
  if (usuario?.rolNombre === 'PANADERO') return '/inventario'
  if (usuario?.area === 'PANADERIA' && puedeCobrar(usuario.rolNombre))
    return '/panaderia'
  return '/mesas'
}
export function puedeRuta(
  path: string,
  usuario: SesionUsuario | null,
  area: AreaTrabajo,
): boolean {
  if (!usuario) return false
  const rol = usuario.rolNombre
  const ruta = path.split('/').filter(Boolean)[0] ?? ''
  if (ruta === 'mi-nomina' || !ruta) return true
  if (['usuarios', 'catalogo', 'nomina'].includes(ruta))
    return esAdministrador(rol)
  if (ruta === 'inventario')
    return [
      'ADMIN',
      'ADMIN_GLOBAL',
      'ADMIN_LOCAL',
      'CAJERO',
      'COCINERO',
      'PANADERO',
    ].includes(rol)
  if (ruta === 'caja') return puedeCobrar(rol) || esGlobal(rol)
  if (ruta === 'cuentas-por-pagar' || ruta === 'remisiones')
    return puedeCobrar(rol) || esGlobal(rol)
  if (ruta === 'impresoras')
    return area === 'RESTAURANTE' && (puedeCobrar(rol) || esGlobal(rol))
  if (ruta === 'panaderia') return area === 'PANADERIA' && puedeCobrar(rol)
  if (ruta === 'cobro') return area === 'RESTAURANTE' && puedeCobrar(rol)
  if (ruta === 'traslados') return area === 'RESTAURANTE' && puedeCobrar(rol)
  if (ruta === 'mesas' || ruta === 'pedidos')
    return (
      area === 'RESTAURANTE' &&
      ['ADMIN_LOCAL', 'CAJERO', 'MESERO', 'COCINERO'].includes(rol)
    )
  // La ficha de empleado se usa desde caja para consultar y pagar jornales.
  if (ruta === 'empleados') return esAdministrador(rol) || rol === 'CAJERO'
  return false
}

export function puedeEntradaPanaderia(rol: string | undefined, tipo: string) {
  return (
    esAdministrador(rol) ||
    (rol === 'PANADERO'
      ? tipo !== 'EXTERNO'
      : rol === 'CAJERO' && tipo === 'EXTERNO')
  )
}
