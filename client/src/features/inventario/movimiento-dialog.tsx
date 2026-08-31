import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useRegistrarMovimiento } from '@/features/inventario/api'
import { formatearCantidad } from '@/lib/formato'
import type { Ingrediente } from '@/types/api'
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

const TIPOS = [
  { valor: 'ENTRADA', etiqueta: 'Entrada (compra)' },
  { valor: 'MERMA', etiqueta: 'Merma' },
  { valor: 'AJUSTE_POSITIVO', etiqueta: 'Ajuste positivo' },
  { valor: 'AJUSTE_NEGATIVO', etiqueta: 'Ajuste negativo' },
] as const

const esquema = z
  .object({
    tipo: z.enum(['ENTRADA', 'MERMA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']),
    cantidad: z.coerce.number<number>().positive('La cantidad debe ser mayor a 0'),
    motivo: z.string().max(150, 'Maximo 150 caracteres').optional(),
  })
  .refine((v) => v.tipo === 'ENTRADA' || Boolean(v.motivo?.trim()), {
    path: ['motivo'],
    error: 'Las mermas y ajustes requieren un motivo',
  })

type Valores = z.infer<typeof esquema>

export function MovimientoDialog({
  ingrediente,
  onCerrar,
}: {
  ingrediente: Ingrediente | null
  onCerrar: () => void
}) {
  const registrar = useRegistrarMovimiento()

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { tipo: 'ENTRADA', cantidad: 0, motivo: '' },
  })

  useEffect(() => {
    if (ingrediente) form.reset({ tipo: 'ENTRADA', cantidad: 0, motivo: '' })
  }, [ingrediente, form])

  function enviar(valores: Valores) {
    if (!ingrediente) return
    registrar
      .mutateAsync({
        idIngrediente: ingrediente.id_ingrediente,
        tipo: valores.tipo,
        cantidad: valores.cantidad,
        ...(valores.motivo?.trim() ? { motivo: valores.motivo.trim() } : {}),
      })
      .then(() => {
        toast.success('Movimiento registrado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={ingrediente !== null} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Movimiento de inventario</DialogTitle>
          <DialogDescription>
            {ingrediente
              ? `${ingrediente.nombre_ingrediente} · stock actual ${formatearCantidad(ingrediente.stock_ingrediente)} ${ingrediente.unidades_ingrediente}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPOS.map((t) => (
                          <SelectItem key={t.valor} value={t.valor}>
                            {t.etiqueta}
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
                name="cantidad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Input placeholder="Obligatorio para mermas y ajustes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="btn-heat w-full" disabled={registrar.isPending}>
              {registrar.isPending ? 'Registrando…' : 'Registrar movimiento'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
