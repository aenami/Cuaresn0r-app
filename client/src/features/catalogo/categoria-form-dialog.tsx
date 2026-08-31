import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useActualizarCategoria, useCrearCategoria } from '@/features/catalogo/api'
import type { Categoria } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

const esquema = z.object({
  name: z.string().min(1, 'Ingresa el nombre').max(30, 'Maximo 30 caracteres'),
  description: z.string().max(300).optional(),
  destino: z.enum(['COCINA', 'BARRA']),
  esAdicion: z.boolean(),
})

type Valores = z.infer<typeof esquema>

export function CategoriaFormDialog({
  categoria,
  abierto,
  onCerrar,
}: {
  categoria: Categoria | null
  abierto: boolean
  onCerrar: () => void
}) {
  const crear = useCrearCategoria()
  const actualizar = useActualizarCategoria()
  const mutacion = categoria ? actualizar : crear

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { name: '', description: '', destino: 'COCINA', esAdicion: false },
  })

  useEffect(() => {
    if (abierto) {
      form.reset({
        name: categoria?.nombre_categoria ?? '',
        description: categoria?.descripcion_categoria ?? '',
        destino: categoria?.destino_categoria ?? 'COCINA',
        esAdicion: categoria?.es_adicion ?? false,
      })
    }
  }, [abierto, categoria, form])

  function enviar(valores: Valores) {
    const payload = {
      name: valores.name,
      destino: valores.destino,
      esAdicion: valores.esAdicion,
      ...(valores.description ? { description: valores.description } : {}),
    }
    const promesa = categoria
      ? actualizar.mutateAsync({ id: categoria.id_categoria, ...payload })
      : crear.mutateAsync(payload)
    promesa
      .then(() => {
        toast.success(categoria ? 'Categoria actualizada' : 'Categoria creada')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {categoria ? 'Editar categoria' : 'Nueva categoria'}
          </DialogTitle>
          <DialogDescription>
            Agrupa productos del menu para navegarlos mas rapido.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Hamburguesas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destino"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Donde se prepara</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="COCINA">Cocina</SelectItem>
                      <SelectItem value="BARRA">Barra (bebidas)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripcion (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="esAdicion"
              render={({ field }) => (
                <FormItem>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:border-primary/40">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                    </FormControl>
                    <span>
                      <span className="text-sm font-medium">Categoria de adiciones</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Sus productos solo se ofrecen como adiciones al personalizar, no sueltos en el menu.
                      </span>
                    </span>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="btn-heat w-full" disabled={mutacion.isPending}>
              {mutacion.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
