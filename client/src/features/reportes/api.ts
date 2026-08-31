import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReporteResumen } from '@/types/api'

export function reporteQuery(desde: string, hasta: string) {
  return queryOptions({
    queryKey: ['reportes', 'resumen', desde, hasta],
    queryFn: () =>
      api.get<ReporteResumen>(
        `/reports/resumen?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
      ),
    // Un poco de cache: la analitica no necesita estar al segundo.
    staleTime: 60_000,
  })
}

export type PresetRango = 'hoy' | 'ayer' | '7dias' | '30dias' | 'mes'

export const PRESETS: { id: PresetRango; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'ayer', etiqueta: 'Ayer' },
  { id: '7dias', etiqueta: '7 dias' },
  { id: '30dias', etiqueta: '30 dias' },
  { id: 'mes', etiqueta: 'Mes actual' },
]

// Los limites se mandan como ISO local sin zona ("YYYY-MM-DDTHH:mm:ss"): el
// backend corre en la zona del restaurante y su new Date() los interpreta local
// (mismo supuesto de la seccion 20 de la spec). El navegador tambien esta en la
// zona del negocio, asi que ambos coinciden.
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function inicioDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
}

function finDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
}

export interface Rango {
  desde: string
  hasta: string
}

export function rangoDePreset(preset: PresetRango): Rango {
  const ahora = new Date()
  switch (preset) {
    case 'hoy':
      return { desde: isoLocal(inicioDia(ahora)), hasta: isoLocal(ahora) }
    case 'ayer': {
      const a = new Date(ahora)
      a.setDate(a.getDate() - 1)
      return { desde: isoLocal(inicioDia(a)), hasta: isoLocal(finDia(a)) }
    }
    case '7dias': {
      const a = new Date(ahora)
      a.setDate(a.getDate() - 6)
      return { desde: isoLocal(inicioDia(a)), hasta: isoLocal(ahora) }
    }
    case '30dias': {
      const a = new Date(ahora)
      a.setDate(a.getDate() - 29)
      return { desde: isoLocal(inicioDia(a)), hasta: isoLocal(ahora) }
    }
    case 'mes': {
      const a = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      return { desde: isoLocal(inicioDia(a)), hasta: isoLocal(ahora) }
    }
  }
}

// "YYYY-MM-DD" (inputs date) -> rango del dia completo.
export function rangoPersonalizado(desdeYmd: string, hastaYmd: string): Rango {
  const [y1, m1, d1] = desdeYmd.split('-').map(Number)
  const [y2, m2, d2] = hastaYmd.split('-').map(Number)
  return {
    desde: isoLocal(new Date(y1, m1 - 1, d1, 0, 0, 0)),
    hasta: isoLocal(new Date(y2, m2 - 1, d2, 23, 59, 59)),
  }
}
