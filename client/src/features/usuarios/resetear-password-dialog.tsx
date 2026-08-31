import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useResetearPassword } from '@/features/usuarios/api'
import type { Usuario } from '@/types/api'
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

const esquema = z
  .object({
    newPassword: z.string().min(8, 'Minimo 8 caracteres'),
    confirmar: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((v) => v.newPassword === v.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

type Valores = z.infer<typeof esquema>

export function ResetearPasswordDialog({
  usuario,
  abierto,
  onCerrar,
}: {
  usuario: Usuario | null
  abierto: boolean
  onCerrar: () => void
}) {
  const resetear = useResetearPassword()
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { newPassword: '', confirmar: '' },
  })

  useEffect(() => {
    if (abierto) form.reset({ newPassword: '', confirmar: '' })
  }, [abierto, form])

  function enviar(valores: Valores) {
    if (!usuario) return
    resetear
      .mutateAsync({ id: usuario.id_usuario, newPassword: valores.newPassword })
      .then(() => {
        toast.success('Contraseña restablecida')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Restablecer contraseña</DialogTitle>
          <DialogDescription>
            {usuario ? (
              <>
                Nueva clave para <span className="text-foreground">{usuario.email_usuario}</span>. No
                se pide la actual: es para cuando el usuario la olvido.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Minimo 8 caracteres" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmar"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Repite la contraseña" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="btn-heat w-full" disabled={resetear.isPending}>
              {resetear.isPending ? 'Guardando…' : 'Restablecer'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
