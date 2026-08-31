import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, MoreVertical, Plus, SquarePen, Trash2, Users } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useEsAdmin } from '@/stores/auth.store'
import {
  empleadosActivosQuery,
  rolesQuery,
  useEliminarUsuario,
  usuariosQuery,
} from '@/features/usuarios/api'
import { UsuarioFormDialog } from '@/features/usuarios/usuario-form-dialog'
import { ResetearPasswordDialog } from '@/features/usuarios/resetear-password-dialog'
import type { Usuario } from '@/types/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_auth/usuarios')({
  component: PaginaUsuarios,
})

function errorATexto(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Error de conexion'
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function claseBadgeRol(nombre: string): string {
  return nombre === 'ADMIN'
    ? 'bg-primary/15 text-primary'
    : nombre === 'CAJERO'
      ? 'bg-tertiary/15 text-tertiary'
      : 'bg-secondary text-secondary-foreground'
}

function BadgeRol({ nombre }: { nombre: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
        claseBadgeRol(nombre),
      )}
    >
      {nombre}
    </span>
  )
}

function PaginaUsuarios() {
  const esAdmin = useEsAdmin()
  const { data: usuarios, isPending } = useQuery(usuariosQuery)
  const { data: roles } = useQuery(rolesQuery)
  const { data: empleadosActivos } = useQuery(empleadosActivosQuery)
  const eliminar = useEliminarUsuario()

  const [dialogo, setDialogo] = useState<{ abierto: boolean; usuario: Usuario | null }>({
    abierto: false,
    usuario: null,
  })
  const [reset, setReset] = useState<{ abierto: boolean; usuario: Usuario | null }>({
    abierto: false,
    usuario: null,
  })
  const [porEliminar, setPorEliminar] = useState<Usuario | null>(null)

  if (!esAdmin) {
    return (
      <div className="p-6 md:p-10">
        <p className="text-sm text-muted-foreground">La gestion de usuarios la maneja el administrador.</p>
      </div>
    )
  }

  const lista = usuarios ?? []
  // Empleados activos que aun no tienen un usuario: candidatos para crear acceso.
  const idsConUsuario = new Set(lista.map((u) => u.empleado.id_empleado))
  const empleadosDisponibles = (empleadosActivos ?? []).filter((e) => !idsConUsuario.has(e.id_empleado))
  const admins = lista.filter((u) => u.rol.nombre_rol === 'ADMIN').length

  function confirmarEliminar() {
    if (!porEliminar) return
    eliminar
      .mutateAsync(porEliminar.id_usuario)
      .then(() => {
        toast.success('Usuario eliminado')
        setPorEliminar(null)
      })
      .catch((e: unknown) => toast.error(errorATexto(e)))
  }

  return (
    <div className="p-6 md:p-10">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="micro-label mb-2 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Acceso · usuarios
          </p>
          <h1 className="font-heading text-3xl font-semibold uppercase tracking-tighter">Usuarios</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {lista.length} {lista.length === 1 ? 'usuario' : 'usuarios'} con acceso · {admins}{' '}
            {admins === 1 ? 'administrador' : 'administradores'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogo({ abierto: true, usuario: null })}
          className="btn-heat group inline-flex h-11 shrink-0 items-center gap-2.5 rounded-lg pl-2 pr-4 font-heading text-sm font-semibold uppercase tracking-wide"
        >
          <span className="grid size-6 place-items-center rounded-md bg-primary-foreground/15 transition-transform group-hover:rotate-90">
            <Plus className="size-4" strokeWidth={2.75} />
          </span>
          Nuevo usuario
        </button>
      </div>

      {isPending ? (
        <p className="mt-8 text-sm text-muted-foreground">Cargando usuarios…</p>
      ) : lista.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-surface-low p-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-lg bg-surface-high text-muted-foreground">
            <Users className="size-6" />
          </div>
          <p className="mt-4 font-heading text-lg font-semibold">Sin usuarios todavia</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Crea el primer acceso al sistema para un empleado activo. El empleado usara su email y clave
            para iniciar sesion.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl bg-surface-low">
          {/* Tarjetas en telefono */}
          <ul className="divide-y divide-border md:hidden">
            {lista.map((u) => (
              <li key={u.id_usuario} className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-semibold">{u.email_usuario}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {u.empleado.nombre_empleado} {u.empleado.apellido_empleado}
                    {u.empleado.estado_empleado === 'INACTIVO' ? ' · retirado' : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <BadgeRol nombre={u.rol.nombre_rol} />
                    <span className="text-xs text-muted-foreground">{formatearFecha(u.fecha_creacion_usuario)}</span>
                  </div>
                </div>
                <MenuAcciones
                  onEditar={() => setDialogo({ abierto: true, usuario: u })}
                  onResetear={() => setReset({ abierto: true, usuario: u })}
                  onEliminar={() => setPorEliminar(u)}
                />
              </li>
            ))}
          </ul>

          {/* Tabla en tablet/desktop */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="micro-label px-5 py-3 font-medium">Email</th>
                <th className="micro-label px-5 py-3 font-medium">Empleado</th>
                <th className="micro-label px-5 py-3 font-medium">Rol</th>
                <th className="micro-label px-5 py-3 font-medium">Creado</th>
                <th className="micro-label px-5 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.map((u) => (
                <tr key={u.id_usuario}>
                  <td className="px-5 py-3.5 font-medium">{u.email_usuario}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {u.empleado.nombre_empleado} {u.empleado.apellido_empleado}
                    {u.empleado.estado_empleado === 'INACTIVO' ? (
                      <span className="ml-2 text-xs text-destructive">retirado</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <BadgeRol nombre={u.rol.nombre_rol} />
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
                    {formatearFecha(u.fecha_creacion_usuario)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">
                      <MenuAcciones
                        onEditar={() => setDialogo({ abierto: true, usuario: u })}
                        onResetear={() => setReset({ abierto: true, usuario: u })}
                        onEliminar={() => setPorEliminar(u)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UsuarioFormDialog
        key={dialogo.usuario?.id_usuario ?? 'nuevo'}
        usuario={dialogo.usuario}
        empleadosDisponibles={empleadosDisponibles}
        roles={roles ?? []}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />

      <ResetearPasswordDialog
        usuario={reset.usuario}
        abierto={reset.abierto}
        onCerrar={() => setReset((r) => ({ ...r, abierto: false }))}
      />

      <Dialog open={porEliminar !== null} onOpenChange={(open) => !open && setPorEliminar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Eliminar usuario</DialogTitle>
            <DialogDescription>
              Se eliminara el acceso de{' '}
              <span className="text-foreground">{porEliminar?.email_usuario}</span>. El empleado no se
              borra. Si el usuario tiene actividad registrada (pedidos, turnos), no podra eliminarse:
              desactiva su empleado en su lugar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPorEliminar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarEliminar}
              disabled={eliminar.isPending}
            >
              {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MenuAcciones({
  onEditar,
  onResetear,
  onEliminar,
}: {
  onEditar: () => void
  onResetear: () => void
  onEliminar: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label="Acciones">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onEditar}>
          <SquarePen className="size-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onResetear}>
          <KeyRound className="size-4" /> Restablecer contraseña
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={onEliminar}>
          <Trash2 className="size-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
