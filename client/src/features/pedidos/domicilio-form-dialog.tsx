import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Bike } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAbrirDomicilio } from '@/features/pedidos/api'
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

// Longitudes en linea con las columnas del backend (VarChar 80/30/150).
const esquema = z.object({
  nombreCliente: z.string().min(1, 'Ingresa el nombre del cliente').max(80, 'Maximo 80 caracteres'),
  telefonoCliente: z.string().min(1, 'Ingresa un telefono de contacto').max(30, 'Maximo 30 caracteres'),
  direccionCliente: z.string().min(1, 'Ingresa la direccion de entrega').max(150, 'Maximo 150 caracteres'),
})

type Valores = z.infer<typeof esquema>

const VACIO: Valores = { nombreCliente: '', telefonoCliente: '', direccionCliente: '' }

// Abre un pedido de domicilio (sin mesa) y navega directo a tomar sus items.
export function DomicilioFormDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const navigate = useNavigate()
  const abrir = useAbrirDomicilio()

  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: VACIO })

  useEffect(() => {
    if (abierto) form.reset(VACIO)
  }, [abierto, form])

  function enviar(valores: Valores) {
    abrir
      .mutateAsync(valores)
      .then((pedido) => {
        toast.success('Domicilio abierto')
        onCerrar()
        void navigate({ to: '/pedidos/$idPedido', params: { idPedido: String(pedido.id_pedido) } })
      })
      .catch((e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Error de conexion'))
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading tracking-tight">
            <Bike className="size-5 text-primary" /> Nuevo domicilio
          </DialogTitle>
          <DialogDescription>
            El pedido no ocupa mesa. Registra a quien y donde se entrega.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="nombreCliente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre de quien recibe" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telefonoCliente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input inputMode="tel" placeholder="300 000 0000" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="direccionCliente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Direccion de entrega</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Calle, numero, barrio e indicaciones" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="btn-heat w-full" disabled={abrir.isPending}>
              {abrir.isPending ? 'Abriendo…' : 'Abrir domicilio'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
