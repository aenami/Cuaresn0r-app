import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useActualizarIngrediente, useCrearIngrediente } from '@/features/inventario/api'
import type { Ingrediente, UnidadIngrediente } from '@/types/api'
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

const UNIDADES: UnidadIngrediente[] = ['kg', 'g', 'dg', 'mg', 'ml', 'L', 'UNIDADES']

const esquema = z.object({
  name: z.string().min(1, 'Ingresa el nombre').max(25, 'Maximo 25 caracteres'),
  units: z.enum(UNIDADES as [UnidadIngrediente, ...UnidadIngrediente[]]),
  stock: z.coerce.number<number>().min(0, 'No puede ser negativo'),
  price: z.coerce.number<number>().min(0, 'No puede ser negativo'),
  lowThreshold: z.string().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Valor invalido'),
  highThreshold: z.string().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Valor invalido'),
}).refine(
  (v) => v.lowThreshold === '' || v.highThreshold === '' || Number(v.lowThreshold) < Number(v.highThreshold),
  { message: 'Debe ser mayor que el umbral bajo', path: ['highThreshold'] },
)

type Valores = z.infer<typeof esquema>

export function IngredienteFormDialog({
  ingrediente,
  abierto,
  onCerrar,
}: {
  ingrediente: Ingrediente | null
  abierto: boolean
  onCerrar: () => void
}) {
  const crear = useCrearIngrediente()
  const actualizar = useActualizarIngrediente()
  const mutacion = ingrediente ? actualizar : crear

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { name: '', units: 'UNIDADES', stock: 0, price: 0, lowThreshold: '', highThreshold: '' },
  })

  useEffect(() => {
    if (abierto) {
      form.reset({
        name: ingrediente?.nombre_ingrediente ?? '',
        units: ingrediente?.unidades_ingrediente ?? 'UNIDADES',
        stock: ingrediente ? Number(ingrediente.stock_ingrediente) : 0,
        price: ingrediente ? Number(ingrediente.precio_ingrediente) : 0,
        lowThreshold: ingrediente?.umbral_bajo_ingrediente ?? '',
        highThreshold: ingrediente?.umbral_alto_ingrediente ?? '',
      })
    }
  }, [abierto, ingrediente, form])

  function enviar(valores: Valores) {
    // Al editar no se toca el stock: eso se hace con movimientos de inventario
    // para dejar rastro (entrada, merma, ajuste).
    const promesa = ingrediente
      ? actualizar.mutateAsync({
          id: ingrediente.id_ingrediente,
          name: valores.name,
          units: valores.units,
          price: valores.price,
          lowThreshold: valores.lowThreshold === '' ? null : Number(valores.lowThreshold),
          highThreshold: valores.highThreshold === '' ? null : Number(valores.highThreshold),
        })
      : crear.mutateAsync({
          name: valores.name,
          units: valores.units,
          stock: valores.stock,
          price: valores.price,
          lowThreshold: valores.lowThreshold === '' ? null : Number(valores.lowThreshold),
          highThreshold: valores.highThreshold === '' ? null : Number(valores.highThreshold),
        })
    promesa
      .then(() => {
        toast.success(ingrediente ? 'Ingrediente actualizado' : 'Ingrediente creado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {ingrediente ? 'Editar ingrediente' : 'Nuevo ingrediente'}
          </DialogTitle>
          <DialogDescription>
            {ingrediente
              ? 'El stock no se edita aqui: usa un movimiento de inventario.'
              : 'El stock inicial queda registrado como punto de partida.'}
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
                    <Input placeholder="Tocineta" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="units"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UNIDADES.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!ingrediente ? (
                <FormField
                  control={form.control}
                  name="stock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock inicial</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="any" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo unitario</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="lowThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Umbral bajo (opcional)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" placeholder="Sin definir" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="highThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Umbral alto (opcional)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" placeholder="Sin definir" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
