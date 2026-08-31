import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useCrearUsuario, useEditarUsuario } from '@/features/usuarios/api'
import type { Empleado, Rol, Usuario } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function construirEsquema(esEdicion: boolean) {
  return z.object({
    // En edicion el empleado no se reasigna (el backend no lo permite).
    idEmpleado: esEdicion
      ? z.string().optional()
      : z.string().min(1, 'Selecciona un empleado'),
    idRol: z.string().min(1, 'Selecciona un rol'),
    email: z.string().min(1, 'Ingresa el email').email('Email invalido').max(100, 'Maximo 100 caracteres'),
    // En edicion la clave no se toca aqui (hay "Restablecer contraseña" aparte).
    password: esEdicion ? z.string().optional() : z.string().min(8, 'Minimo 8 caracteres'),
  })
}

type Valores = z.infer<ReturnType<typeof construirEsquema>>

export function UsuarioFormDialog({
  usuario,
  empleadosDisponibles,
  roles,
  abierto,
  onCerrar,
}: {
  usuario: Usuario | null
  empleadosDisponibles: Empleado[]
  roles: Rol[]
  abierto: boolean
  onCerrar: () => void
}) {
  const esEdicion = !!usuario
  const crear = useCrearUsuario()
  const editar = useEditarUsuario()
  const mutacion = esEdicion ? editar : crear
  const esquema = useMemo(() => construirEsquema(esEdicion), [esEdicion])

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { idEmpleado: '', idRol: '', email: '', password: '' },
  })

  useEffect(() => {
    if (abierto) {
      form.reset({
        idEmpleado: usuario ? String(usuario.empleado.id_empleado) : '',
        idRol: usuario ? String(usuario.rol.id_rol) : '',
        email: usuario?.email_usuario ?? '',
        password: '',
      })
    }
  }, [abierto, usuario, form])

  function enviar(valores: Valores) {
    const promesa = usuario
      ? editar.mutateAsync({ id: usuario.id_usuario, email: valores.email, idRol: Number(valores.idRol) })
      : crear.mutateAsync({
          idEmpleado: Number(valores.idEmpleado),
          idRol: Number(valores.idRol),
          email: valores.email,
          password: valores.password ?? '',
        })
    promesa
      .then(() => {
        toast.success(usuario ? 'Usuario actualizado' : 'Usuario creado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {esEdicion ? 'Editar usuario' : 'Nuevo usuario'}
          </DialogTitle>
          <DialogDescription>
            {esEdicion
              ? 'Cambia el email o el rol de acceso. El empleado vinculado no se reasigna; para cambiar la clave usa "Restablecer contraseña".'
              : 'Un usuario es el acceso al sistema de un empleado. Elige el empleado, su rol y una clave inicial (minimo 8 caracteres).'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            {esEdicion ? (
              <div className="rounded-lg border border-border bg-surface-high px-3 py-2.5">
                <p className="micro-label">Empleado</p>
                <p className="mt-0.5 text-sm font-medium">
                  {usuario.empleado.nombre_empleado} {usuario.empleado.apellido_empleado}
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="idEmpleado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empleado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona un empleado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {empleadosDisponibles.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No hay empleados activos sin acceso
                          </div>
                        ) : (
                          empleadosDisponibles.map((e) => (
                            <SelectItem key={e.id_empleado} value={String(e.id_empleado)}>
                              {e.nombre_empleado} {e.apellido_empleado}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="empleado@pos.local" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="idRol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id_rol} value={String(r.id_rol)}>
                          {r.nombre_rol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!esEdicion && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña inicial</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Minimo 8 caracteres" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" className="btn-heat w-full" disabled={mutacion.isPending}>
              {mutacion.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
