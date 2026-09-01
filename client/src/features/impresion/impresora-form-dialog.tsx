import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useActualizarImpresora, useCrearImpresora } from '@/features/impresion/api'
import type { Impresora } from '@/types/api'
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

const esquema = z.object({
  nombre: z.string().min(1, 'Ingresa el nombre').max(30, 'Maximo 30 caracteres'),
  destino: z.enum(['COCINA', 'BARRA', 'GENERAL']),
  dispositivo: z.string().min(1, 'Ingresa el nombre de la cola de Windows').max(100),
  anchoPapel: z.enum(['80', '58']),
})

type Valores = z.infer<typeof esquema>

export function ImpresoraFormDialog({
  impresora,
  abierto,
  onCerrar,
}: {
  impresora: Impresora | null
  abierto: boolean
  onCerrar: () => void
}) {
  const crear = useCrearImpresora()
  const actualizar = useActualizarImpresora()
  const mutacion = impresora ? actualizar : crear

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: '', destino: 'COCINA', dispositivo: '', anchoPapel: '80' },
  })

  useEffect(() => {
    if (abierto) {
      form.reset({
        nombre: impresora?.nombre_impresora ?? '',
        destino: impresora?.destino_impresora ?? 'COCINA',
        dispositivo: impresora?.dispositivo_impresora ?? '',
        anchoPapel: String(impresora?.ancho_papel_impresora ?? 80) as '80' | '58',
      })
    }
  }, [abierto, impresora, form])

  function enviar(valores: Valores) {
    const payload = {
      nombre: valores.nombre,
      destino: valores.destino,
      dispositivo: valores.dispositivo,
      anchoPapel: Number(valores.anchoPapel),
    }
    const promesa = impresora
      ? actualizar.mutateAsync({ id: impresora.id_impresora, ...payload })
      : crear.mutateAsync(payload)
    promesa
      .then(() => {
        toast.success(impresora ? 'Impresora actualizada' : 'Impresora creada')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {impresora ? 'Editar impresora' : 'Nueva impresora'}
          </DialogTitle>
          <DialogDescription>
            Termica USB Epson TM-m30II instalada como impresora de Windows. Solo hay
            una impresora activa por destino: crear o activar otra desactiva la anterior. Si el
            local tiene una sola termica, usa el destino General: recibe los tickets de cocina
            y barra por separado y el mesero los reparte.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Cocina principal" {...field} />
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
                    <FormLabel>Destino</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COCINA">Cocina</SelectItem>
                        <SelectItem value="BARRA">Barra</SelectItem>
                        <SelectItem value="GENERAL">General (unica impresora)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="dispositivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la impresora en Windows</FormLabel>
                  <FormControl>
                    <Input placeholder="EPSON TM-m30II Receipt" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="anchoPapel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Papel</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="80">80mm (48 columnas)</SelectItem>
                      <SelectItem value="58">58mm (32 columnas)</SelectItem>
                    </SelectContent>
                  </Select>
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
