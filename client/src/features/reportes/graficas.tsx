import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatearPrecio } from '@/lib/formato'
import type { ReporteResumen } from '@/types/api'
import { COLOR_METODO, COLORES, NOMBRE_METODO, PALETA } from '@/features/reportes/paleta'

const EJE = { fill: '#ADAAAA', fontSize: 11 }
const GRID = 'rgba(255,255,255,0.07)'

const tooltipComun = {
  cursor: { fill: 'rgba(255,255,255,0.04)' },
  contentStyle: {
    background: '#20201F',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  labelStyle: { color: '#FFFFFF', marginBottom: 4, fontWeight: 600 },
  itemStyle: { color: '#ADAAAA' },
} as const

// Eje Y de dinero compacto ("$1.2M", "$300k").
function compacto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n}`
}

const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' })
function etiquetaDia(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return fechaCorta.format(new Date(y, m - 1, d))
}

export function AreaVentasDia({ datos }: { datos: ReporteResumen['porDia'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORES.naranja} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLORES.naranja} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="fecha"
          tickFormatter={etiquetaDia}
          tick={EJE}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis tickFormatter={compacto} tick={EJE} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          {...tooltipComun}
          labelFormatter={(l) => etiquetaDia(String(l))}
          formatter={(v) => [formatearPrecio(Number(v)), 'Ventas'] as [string, string]}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={COLORES.naranja}
          strokeWidth={2}
          fill="url(#gradVentas)"
          dot={false}
          activeDot={{ r: 4, fill: COLORES.naranja }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarrasVentasHora({ datos }: { datos: ReporteResumen['porHora'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="hora"
          tickFormatter={(h) => `${String(h).padStart(2, '0')}h`}
          tick={EJE}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={2}
        />
        <YAxis tickFormatter={compacto} tick={EJE} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          {...tooltipComun}
          labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
          formatter={(v) => [formatearPrecio(Number(v)), 'Ventas'] as [string, string]}
        />
        <Bar dataKey="total" fill={COLORES.naranja} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Conteo de domicilios por dia (barras). Eje Y entero (no es dinero).
export function BarrasDomiciliosDia({ datos }: { datos: ReporteResumen['porDia'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="fecha"
          tickFormatter={etiquetaDia}
          tick={EJE}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={EJE} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          {...tooltipComun}
          labelFormatter={(l) => etiquetaDia(String(l))}
          formatter={(v) => [String(v), 'Domicilios'] as [string, string]}
        />
        <Bar dataKey="domicilios" fill={COLORES.teal} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutMetodos({ datos }: { datos: ReporteResumen['metodosPago'] }) {
  const conNombre = datos.map((d) => ({ ...d, nombre: NOMBRE_METODO[d.metodo] }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={conNombre}
          dataKey="monto"
          nameKey="nombre"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {conNombre.map((d) => (
            <Cell key={d.metodo} fill={COLOR_METODO[d.metodo]} />
          ))}
        </Pie>
        <Tooltip
          {...tooltipComun}
          formatter={(v, n) => [formatearPrecio(Number(v)), String(n)] as [string, string]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Barras horizontales para el ranking de categorias.
export function BarrasCategoria({ datos }: { datos: ReporteResumen['porCategoria'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
      >
        <XAxis type="number" tickFormatter={compacto} tick={EJE} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="categoria"
          tick={EJE}
          tickLine={false}
          axisLine={false}
          width={96}
        />
        <Tooltip
          {...tooltipComun}
          formatter={(v) => [formatearPrecio(Number(v)), 'Ingresos'] as [string, string]}
        />
        <Bar dataKey="ingresos" radius={[0, 4, 4, 0]}>
          {datos.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
