import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { productosQuery, useActualizarCombo, useCrearCombo } from '@/features/catalogo/api'
import type { Combo } from '@/types/api'
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
  nombre: z.string().min(1, 'Ingresa el nombre').max(50, 'Maximo 50 caracteres'),
  precio: z.coerce.number<number>().positive('El precio debe ser mayor a 0'),
  componentes: z
    .array(
      z.object({
        idProducto: z.string().min(1, 'Elige un producto'),
        cantidad: z.coerce.number<number>().positive('Cantidad invalida'),
      }),
    )
    .min(1, 'Un combo necesita al menos un producto'),
})

type Valores = z.infer<typeof esquema>

export function ComboFormDialog({
  combo,
  abierto,
  onCerrar,
}: {
  combo: Combo | null
  abierto: boolean
  onCerrar: () => void
}) {
  const { data: productos } = useQuery(productosQuery)
  const crear = useCrearCombo()
  const actualizar = useActualizarCombo()
  const mutacion = combo ? actualizar : crear

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: '', precio: 0, componentes: [{ idProducto: '', cantidad: 1 }] },
  })
  const componentes = useFieldArray({ control: form.control, name: 'componentes' })

  useEffect(() => {
    if (abierto) {
      form.reset({
        nombre: combo?.nombre_combo ?? '',
        precio: combo ? Number(combo.precio_combo) : 0,
        componentes: combo?.detallesCombo?.length
          ? combo.detallesCombo.map((d) => ({
              idProducto: String(d.id_producto_detalleCombo),
              cantidad: Number(d.cantidad_detalleCombo),
            }))
          : [{ idProducto: '', cantidad: 1 }],
      })
    }
  }, [abierto, combo, form])

  function enviar(valores: Valores) {
    const payload = {
      nombre: valores.nombre,
      precio: valores.precio,
      componentes: valores.componentes.map((c) => ({
        idProducto: Number(c.idProducto),
        cantidad: c.cantidad,
      })),
    }
    const promesa = combo
      ? actualizar.mutateAsync({ id: combo.id_combo, ...payload })
      : crear.mutateAsync(payload)
    promesa
      .then(() => {
        toast.success(combo ? 'Combo actualizado' : 'Combo creado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  const habilitados = productos?.filter((p) => p.habilitado_producto) ?? []

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {combo ? 'Editar combo' : 'Nuevo combo'}
          </DialogTitle>
          <DialogDescription>
            El precio del combo reemplaza la suma de sus productos. Al editar, la lista de
            componentes se reemplaza completa.
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
                      <Input placeholder="Combo Burger" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="precio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={100} inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <p className="micro-label mb-2">Componentes</p>
              <div className="space-y-2">
                {componentes.fields.map((campo, indice) => (
                  <div key={campo.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`componentes.${indice}.idProducto`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Producto" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {habilitados.map((p) => (
                                <SelectItem key={p.id_producto} value={String(p.id_producto)}>
                                  {p.nombre_producto}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`componentes.${indice}.cantidad`}
                      render={({ field }) => (
                        <FormItem className="w-20">
                          <FormControl>
                            <Input type="number" min={1} step={1} aria-label="Cantidad" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => componentes.remove(indice)}
                      disabled={componentes.fields.length === 1}
                      aria-label="Quitar componente"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => componentes.append({ idProducto: '', cantidad: 1 })}
              >
                Agregar componente
              </Button>
            </div>

            <Button type="submit" className="btn-heat w-full" disabled={mutacion.isPending}>
              {mutacion.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
