import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, MoreVertical, UserPlus } from 'lucide-react'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import {
  empleadosQuery,
  saldosNominaQuery,
  useDesactivarEmpleado,
  useReactivarEmpleado,
} from '@/features/nomina/api'
import type { Empleado, EstadoEmpleado } from '@/types/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorApi, idCorto, nombreEmpleado } from './comun'
import { EmpleadoDialog } from './empleado-form-dialog'

type FiltroEstado = 'ACTIVO' | 'INACTIVO' | 'TODOS'

export function Directorio({ esAdmin }: { esAdmin: boolean }) {
  const [filtro, setFiltro] = useState<FiltroEstado>('ACTIVO')
  const estado: EstadoEmpleado | undefined = filtro === 'TODOS' ? undefined : filtro
  const { data: empleados, isPending } = useQuery(empleadosQuery(estado))
  const { data: saldos } = useQuery(saldosNominaQuery)
  const [dialogo, setDialogo] = useState<{ abierto: boolean; empleado: Empleado | null }>({
    abierto: false,
    empleado: null,
  })

  const saldoPorId = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of saldos ?? []) m.set(s.id_empleado, s.saldoPendiente)
    return m
  }, [saldos])

  const activos = (empleados ?? []).filter((e) => e.estado_empleado === 'ACTIVO').length

  function exportarCSV() {
    const filas = [
      ['ID', 'Apellido', 'Nombre', 'Estado', 'Ingreso', 'Saldo'],
      ...(empleados ?? []).map((e) => [
        idCorto(e.id_empleado),
        e.apellido_empleado,
        e.nombre_empleado,
        e.estado_empleado,
        e.fecha_ingreso_empleado.slice(0, 10),
        Number(saldoPorId.get(e.id_empleado) ?? 0).toFixed(2),
      ]),
    ]
    const csv = filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'empleados.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">Directorio</h1>
          <p className="micro-label mt-2">
            {activos} activos · {(empleados ?? []).length} en la vista
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroEstado)}>
            <SelectTrigger className="h-10 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVO">Activos</SelectItem>
              <SelectItem value="INACTIVO">Retirados</SelectItem>
              <SelectItem value="TODOS">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10 gap-2" onClick={exportarCSV}>
            <Download className="size-4" /> Exportar
          </Button>
          {esAdmin ? (
            <Button
              className="btn-heat h-10 gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
              onClick={() => setDialogo({ abierto: true, empleado: null })}
            >
              <UserPlus className="size-4" /> Nuevo empleado
            </Button>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-high" />
          ))}
        </div>
      ) : (empleados ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay empleados en esta vista.</p>
      ) : (
        <>
          {/* Telefono: tarjetas */}
          <ul className="divide-y divide-border/50 md:hidden">
            {(empleados ?? []).map((e) => {
              const saldo = Number(saldoPorId.get(e.id_empleado) ?? 0)
              const retirado = e.estado_empleado !== 'ACTIVO'
              return (
                <li key={e.id_empleado} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/empleados/$id"
                      params={{ id: String(e.id_empleado) }}
                      className={cn('font-medium hover:text-primary', retirado && 'text-muted-foreground')}
                    >
                      {nombreEmpleado(e)}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="micro-label tabular-nums">{idCorto(e.id_empleado)}</span>
                      <EstadoEmpleadoBadge estado={e.estado_empleado} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        saldo > 0 ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {formatearPrecio(saldo)}
                    </span>
                    <FilaMenu empleado={e} esAdmin={esAdmin} onEditar={() => setDialogo({ abierto: true, empleado: e })} />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Tablet / desktop: tabla */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="micro-label py-2 pr-4">ID</th>
                <th className="micro-label py-2 pr-4">Nombre</th>
                <th className="micro-label py-2 pr-4">Estado</th>
                <th className="micro-label py-2 pr-4">Ingreso</th>
                <th className="micro-label py-2 pl-4 text-right">Saldo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(empleados ?? []).map((e) => {
                const saldo = Number(saldoPorId.get(e.id_empleado) ?? 0)
                const retirado = e.estado_empleado !== 'ACTIVO'
                return (
                  <tr key={e.id_empleado} className="border-b border-border/40 transition-colors hover:bg-surface-high/40">
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{idCorto(e.id_empleado)}</td>
                    <td className="py-3 pr-4">
                      <Link
                        to="/empleados/$id"
                        params={{ id: String(e.id_empleado) }}
                        className={cn('font-medium hover:text-primary', retirado && 'text-muted-foreground')}
                      >
                        {nombreEmpleado(e)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <EstadoEmpleadoBadge estado={e.estado_empleado} />
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                      {formatearFecha(e.fecha_ingreso_empleado)}
                    </td>
                    <td
                      className={cn(
                        'py-3 pl-4 text-right font-semibold tabular-nums',
                        saldo > 0 ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {formatearPrecio(saldo)}
                    </td>
                    <td className="py-3 text-right">
                      <FilaMenu empleado={e} esAdmin={esAdmin} onEditar={() => setDialogo({ abierto: true, empleado: e })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <EmpleadoDialog
        empleado={dialogo.empleado}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  )
}

function EstadoEmpleadoBadge({ estado }: { estado: EstadoEmpleado }) {
  const activo = estado === 'ACTIVO'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        activo ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
      )}
    >
      <span className={cn('size-1.5 rounded-full', activo ? 'bg-primary' : 'bg-muted-foreground')} />
      {activo ? 'Activo' : 'Retirado'}
    </span>
  )
}

function FilaMenu({
  empleado,
  esAdmin,
  onEditar,
}: {
  empleado: Empleado
  esAdmin: boolean
  onEditar: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Acciones">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link to="/empleados/$id" params={{ id: String(empleado.id_empleado) }}>
            Ver perfil
          </Link>
        </DropdownMenuItem>
        {esAdmin ? (
          <>
            <DropdownMenuItem onSelect={onEditar}>Editar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <EmpleadoEstadoAccion empleado={empleado} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmpleadoEstadoAccion({ empleado }: { empleado: Empleado }) {
  const activo = empleado.estado_empleado === 'ACTIVO'
  const desactivar = useDesactivarEmpleado(empleado.id_empleado)
  const reactivar = useReactivarEmpleado(empleado.id_empleado)
  const mut = activo ? desactivar : reactivar
  return (
    <DropdownMenuItem
      className={activo ? 'text-destructive' : 'text-primary'}
      onSelect={(ev) => {
        ev.preventDefault()
        mut
          .mutateAsync()
          .then(() => toast.success(activo ? 'Empleado retirado' : 'Empleado reactivado'))
          .catch((e: unknown) => toast.error(errorApi(e)))
      }}
    >
      {activo ? 'Retirar' : 'Reactivar'}
    </DropdownMenuItem>
  )
}
