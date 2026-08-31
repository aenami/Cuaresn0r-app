import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useCambiarMiPassword } from '@/features/usuarios/api'
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
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: z.string().min(8, 'Minimo 8 caracteres'),
    confirmar: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((v) => v.newPassword === v.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })

type Valores = z.infer<typeof esquema>

export function CambiarPasswordDialog({
  abierto,
  onCerrar,
}: {
  abierto: boolean
  onCerrar: () => void
}) {
  const cambiar = useCambiarMiPassword()
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { currentPassword: '', newPassword: '', confirmar: '' },
  })

  useEffect(() => {
    if (abierto) form.reset({ currentPassword: '', newPassword: '', confirmar: '' })
  }, [abierto, form])

  function enviar(valores: Valores) {
    cambiar
      .mutateAsync({ currentPassword: valores.currentPassword, newPassword: valores.newPassword })
      .then(() => {
        toast.success('Contraseña actualizada')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Cambiar mi contraseña</DialogTitle>
          <DialogDescription>
            Ingresa tu contraseña actual y la nueva (minimo 8 caracteres).
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña actual</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <Button type="submit" className="btn-heat w-full" disabled={cambiar.isPending}>
              {cambiar.isPending ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
