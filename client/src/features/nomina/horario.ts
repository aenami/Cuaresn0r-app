import type { Jornada } from '@/types/api'

export interface TramoEditable {
  inicio: string
  fin: string
  entradaDiaSiguiente: boolean
  salidaDiaSiguiente: boolean
}

export const tramoVacio = (): TramoEditable => ({
  inicio: '',
  fin: '',
  entradaDiaSiguiente: false,
  salidaDiaSiguiente: false,
})
export const hoyColombia = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
const localColombia = (iso: string) =>
  new Date(Date.parse(iso) - 5 * 3600000).toISOString()

export function tramosDeJornada(jornada?: Jornada): TramoEditable[] {
  if (!jornada?.marcaciones?.length) return [tramoVacio()]
  const tramos: TramoEditable[] = []
  for (let i = 0; i < jornada.marcaciones.length; i += 2) {
    const entrada = localColombia(jornada.marcaciones[i].fecha_hora_marcacion)
    const salida = jornada.marcaciones[i + 1]
      ? localColombia(jornada.marcaciones[i + 1].fecha_hora_marcacion)
      : null
    tramos.push({
      inicio: entrada.slice(11, 16),
      fin: salida?.slice(11, 16) ?? '',
      entradaDiaSiguiente:
        entrada.slice(0, 10) > jornada.fecha_jornada.slice(0, 10),
      salidaDiaSiguiente:
        !!salida && salida.slice(0, 10) > jornada.fecha_jornada.slice(0, 10),
    })
  }
  return tramos
}

export function prepararHorario(
  fecha: string,
  editables: TramoEditable[],
  ahora = Date.now(),
) {
  const error = (mensaje: string) => ({
    valido: false as const,
    mensaje,
    minutos: 0,
    tramos: [] as { entrada: string; salida: string }[],
  })
  if (!editables.length || editables.length > 12)
    return error('Registra entre 1 y 12 tramos.')
  const base = new Date(`${fecha}T00:00:00Z`)
  if (
    !Number.isFinite(base.getTime()) ||
    base.toISOString().slice(0, 10) !== fecha
  )
    return error('Selecciona una fecha válida.')
  const siguiente = new Date(base.getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
  const tramos = []
  for (const tramo of editables) {
    if (
      ![tramo.inicio, tramo.fin].every((hora) =>
        /^([01]\d|2[0-3]):[0-5]\d$/.test(hora),
      )
    )
      return error('Completa la entrada y la salida de cada tramo.')
    const entrada = `${tramo.entradaDiaSiguiente ? siguiente : fecha}T${tramo.inicio}:00-05:00`
    const salida = `${tramo.salidaDiaSiguiente ? siguiente : fecha}T${tramo.fin}:00-05:00`
    if (Date.parse(salida) <= Date.parse(entrada))
      return error(
        'La salida debe ser posterior a la entrada. Si cruza medianoche, marca día siguiente.',
      )
    if (Date.parse(salida) > ahora)
      return error('No se pueden confirmar horarios futuros.')
    tramos.push({ entrada, salida })
  }
  tramos.sort((a, b) => Date.parse(a.entrada) - Date.parse(b.entrada))
  if (tramos[0].entrada.slice(0, 10) !== fecha)
    return error('El primer tramo debe iniciar en la fecha seleccionada.')
  if (
    Date.parse(tramos.at(-1)!.salida) - Date.parse(tramos[0].entrada) >
    86400000
  )
    return error('La jornada no puede abarcar más de 24 horas.')
  for (let i = 1; i < tramos.length; i++) {
    if (Date.parse(tramos[i].entrada) < Date.parse(tramos[i - 1].salida))
      return error('Los tramos no pueden superponerse.')
  }
  return {
    valido: true as const,
    mensaje: '',
    minutos: tramos.reduce(
      (total, t) =>
        total + (Date.parse(t.salida) - Date.parse(t.entrada)) / 60000,
      0,
    ),
    tramos,
  }
}

export function duracionHorario(jornada: Jornada) {
  let minutos = 0
  const marcas = jornada.marcaciones ?? []
  for (let i = 0; i + 1 < marcas.length; i += 2)
    minutos +=
      (Date.parse(marcas[i + 1].fecha_hora_marcacion) -
        Date.parse(marcas[i].fecha_hora_marcacion)) /
      60000
  return formatearDuracion(minutos)
}

export function formatearDuracion(minutos: number) {
  const enteros = Math.round(minutos)
  return `${Math.floor(enteros / 60)} h ${String(enteros % 60).padStart(2, '0')} min`
}

export function describirTramos(jornada: Jornada) {
  const marcas = jornada.marcaciones ?? []
  const tramos = []
  for (let i = 0; i < marcas.length; i += 2) {
    const entrada = localColombia(marcas[i].fecha_hora_marcacion)
    const salida = marcas[i + 1]
      ? localColombia(marcas[i + 1].fecha_hora_marcacion)
      : null
    const siguiente = salida && salida.slice(0, 10) !== entrada.slice(0, 10)
    tramos.push(
      `${entrada.slice(11, 16)} – ${salida?.slice(11, 16) ?? 'sin salida'}${siguiente ? ' (+1 día)' : ''}`,
    )
  }
  return tramos.join(' · ')
}
