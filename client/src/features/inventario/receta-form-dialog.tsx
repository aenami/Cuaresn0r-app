import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { ingredientesQuery, useCrearReceta } from '@/features/inventario/api'
import type { Producto, Receta } from '@/types/api'
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
  name: z.string().min(1, 'Ingresa el nombre').max(30, 'Maximo 30 caracteres'),
  ingredients: z
    .array(
      z.object({
        id_ingredient: z.string().min(1, 'Elige un ingrediente'),
        quantity_ingredient: z.coerce.number<number>().positive('Cantidad invalida'),
      }),
    )
    .min(1, 'Una receta necesita al menos un ingrediente'),
})

type Valores = z.infer<typeof esquema>

// Crear una version nueva desactiva la receta activa anterior del producto:
// los pedidos ya tomados conservan la que usaron (snapshot en el backend).
export function RecetaFormDialog({
  producto,
  recetaBase,
  onCerrar,
}: {
  producto: Producto | null
  recetaBase: Receta | null
  onCerrar: () => void
}) {
  const { data: ingredientes } = useQuery(ingredientesQuery)
  const crear = useCrearReceta()

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { name: '', ingredients: [{ id_ingredient: '', quantity_ingredient: 0 }] },
  })
  const filas = useFieldArray({ control: form.control, name: 'ingredients' })

  useEffect(() => {
    if (producto) {
      form.reset({
        name: recetaBase ? `${recetaBase.nombre_receta}`.slice(0, 30) : 'Receta base',
        ingredients: recetaBase?.detalles?.length
          ? recetaBase.detalles.map((d) => ({
              id_ingredient: String(d.id_ingrediente_detalleReceta),
              quantity_ingredient: Number(d.cantidad_ingrediente_detalleReceta),
            }))
          : [{ id_ingredient: '', quantity_ingredient: 0 }],
      })
    }
  }, [producto, recetaBase, form])

  function enviar(valores: Valores) {
    if (!producto) return
    crear
      .mutateAsync({
        id_product_recipe: producto.id_producto,
        name: valores.name,
        ingredients: valores.ingredients.map((i) => ({
          id_ingredient: Number(i.id_ingredient),
          quantity_ingredient: i.quantity_ingredient,
        })),
      })
      .then(() => {
        toast.success('Nueva version de la receta activa')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={producto !== null} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {recetaBase ? 'Nueva version de receta' : 'Crear receta'}
          </DialogTitle>
          <DialogDescription>
            {producto ? `${producto.nombre_producto} · ` : ''}
            La version anterior queda en el historico; los pedidos ya tomados no cambian.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la version</FormLabel>
                  <FormControl>
                    <Input placeholder="Receta base" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="micro-label mb-2">Ingredientes por unidad de producto</p>
              <div className="space-y-2">
                {filas.fields.map((campo, indice) => (
                  <div key={campo.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`ingredients.${indice}.id_ingredient`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Ingrediente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ingredientes?.map((i) => (
                                <SelectItem key={i.id_ingrediente} value={String(i.id_ingrediente)}>
                                  {i.nombre_ingrediente} ({i.unidades_ingrediente})
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
                      name={`ingredients.${indice}.quantity_ingredient`}
                      render={({ field }) => (
                        <FormItem className="w-24">
                          <FormControl>
                            <Input type="number" min={0} step="any" aria-label="Cantidad" {...field} />
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
                      onClick={() => filas.remove(indice)}
                      disabled={filas.fields.length === 1}
                      aria-label="Quitar ingrediente"
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
                onClick={() => filas.append({ id_ingredient: '', quantity_ingredient: 0 })}
              >
                Agregar ingrediente
              </Button>
            </div>

            <Button type="submit" className="btn-heat w-full" disabled={crear.isPending}>
              {crear.isPending ? 'Guardando…' : 'Guardar como version activa'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
