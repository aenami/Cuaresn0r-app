import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  categoriasQuery,
  compartiblesQuery,
  useActualizarProducto,
  useCrearProducto,
  useSubirImagenProducto,
} from '@/features/catalogo/api'
import { ProductoImagen } from '@/features/catalogo/producto-imagen'
import type { Producto } from '@/types/api'
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

const SIN_CATEGORIA = 'sin-categoria'

const esquema = z.object({
  name: z.string().min(1, 'Ingresa el nombre').max(25, 'Maximo 25 caracteres'),
  price: z.coerce.number<number>().positive('El precio debe ser mayor a 0'),
  description: z.string().max(300, 'Maximo 300 caracteres').optional(),
  category: z.string(),
  // Ruta de la imagen ya subida (o URL externa preexistente); vacio = sin imagen.
  image: z.string(),
})

const MAX_BYTES_IMAGEN = 5 * 1024 * 1024

type Valores = z.infer<typeof esquema>

export function ProductoFormDialog({
  producto,
  abierto,
  onCerrar,
}: {
  producto: Producto | null
  abierto: boolean
  onCerrar: () => void
}) {
  const { data: categorias } = useQuery(categoriasQuery)
  const { data: compartibles } = useQuery({
    ...compartiblesQuery,
    enabled: abierto,
  })
  const [tipoEspecial, setTipoEspecial] = useState('NORMAL')
  const [compartido, setCompartido] = useState('')
  const [precioInterno, setPrecioInterno] = useState('')
  const crear = useCrearProducto()
  const actualizar = useActualizarProducto()
  const subir = useSubirImagenProducto()
  const mutacion = producto ? actualizar : crear
  const inputImagenRef = useRef<HTMLInputElement>(null)

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      name: '',
      price: 0,
      description: '',
      category: SIN_CATEGORIA,
      image: '',
    },
  })

  // Valida en el cliente (UX) y sube la imagen; el backend re-valida por
  // contenido. `onListo` recibe la ruta guardada para volcarla al form.
  async function manejarArchivo(
    file: File | undefined,
    onListo: (url: string) => void,
  ) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen (JPG, PNG, WEBP o GIF)')
      return
    }
    if (file.size > MAX_BYTES_IMAGEN) {
      toast.error('La imagen supera el limite de 5 MB')
      return
    }
    try {
      const { url } = await subir.mutateAsync(file)
      onListo(url)
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : 'No se pudo subir la imagen',
      )
    } finally {
      // Permite volver a elegir el mismo archivo si se cambia de opinion.
      if (inputImagenRef.current) inputImagenRef.current.value = ''
    }
  }

  useEffect(() => {
    if (abierto) {
      setTipoEspecial(
        producto?.tipoMenu ??
          (producto?.articuloCompartidoId ? 'COMPARTIDO' : 'NORMAL'),
      )
      setCompartido(
        producto?.articuloCompartidoId
          ? String(producto.articuloCompartidoId)
          : '',
      )
      setPrecioInterno(producto?.precioInternoCompartido ?? '')
      form.reset({
        name: producto?.nombre_producto ?? '',
        price: producto ? Number(producto.precio_producto) : 0,
        description: producto?.descripcion_producto ?? '',
        category: producto?.categoria_producto
          ? String(producto.categoria_producto)
          : SIN_CATEGORIA,
        image: producto?.imagen_producto ?? '',
      })
    }
  }, [abierto, producto, form])

  function enviar(valores: Valores) {
    if (
      tipoEspecial === 'COMPARTIDO' &&
      (!compartido || !(Number(precioInterno) > 0))
    ) {
      toast.error('Selecciona el producto de Panadería y su valor interno')
      return
    }
    const payload = {
      articuloCompartidoId:
        tipoEspecial === 'COMPARTIDO' ? Number(compartido) : null,
      precioInternoCompartido:
        tipoEspecial === 'COMPARTIDO' ? Number(precioInterno) : null,
      tipoMenu: (tipoEspecial === 'EJECUTIVO' || tipoEspecial === 'BANDEJA'
        ? tipoEspecial
        : null) as Producto['tipoMenu'],
      name: valores.name,
      price: valores.price,
      ...(valores.description ? { description: valores.description } : {}),
      ...(valores.category !== SIN_CATEGORIA
        ? { category: Number(valores.category) }
        : {}),
      ...(valores.image ? { image: valores.image } : {}),
    }
    const promesa = producto
      ? actualizar.mutateAsync({ id: producto.id_producto, ...payload })
      : crear.mutateAsync(payload)
    promesa
      .then(() => {
        toast.success(producto ? 'Producto actualizado' : 'Producto creado')
        onCerrar()
      })
      .catch((e: unknown) =>
        toast.error(e instanceof ApiError ? e.message : 'Error de conexion'),
      )
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {producto ? 'Editar producto' : 'Nuevo producto'}
          </DialogTitle>
          <DialogDescription>
            El precio se snapshotea en cada pedido: cambiarlo no afecta pedidos
            ya tomados.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(enviar)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Burger Clasica" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        inputMode="numeric"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="tipo-producto">
                Tipo de producto
              </label>
              <Select value={tipoEspecial} onValueChange={setTipoEspecial}>
                <SelectTrigger id="tipo-producto" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Producto normal</SelectItem>
                  <SelectItem value="COMPARTIDO">
                    Stock compartido de Panadería
                  </SelectItem>
                  <SelectItem value="EJECUTIVO">
                    Ejecutivo · precio fijo
                  </SelectItem>
                  <SelectItem value="BANDEJA">Bandeja · sin caldo</SelectItem>
                </SelectContent>
              </Select>
              {tipoEspecial === 'COMPARTIDO' ? (
                <>
                  <Select value={compartido} onValueChange={setCompartido}>
                    <SelectTrigger
                      className="w-full"
                      aria-label="Producto de Panadería"
                    >
                      <SelectValue placeholder="Selecciona el producto de Panadería" />
                    </SelectTrigger>
                    <SelectContent>
                      {compartibles?.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label htmlFor="precio-interno" className="block text-sm">
                    Valor unitario que Restaurante paga a Panadería
                  </label>
                  <Input
                    id="precio-interno"
                    type="number"
                    min="1"
                    step="1"
                    value={precioInterno}
                    onChange={(e) => setPrecioInterno(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    No usa receta local: reserva el stock de Panadería y genera
                    la remisión al entregar.
                  </p>
                </>
              ) : tipoEspecial !== 'NORMAL' ? (
                <p className="text-xs text-muted-foreground">
                  Configura arroz y ensalada en la receta base. En «Almuerzos
                  del día» define las opciones con sus propias recetas.
                </p>
              ) : null}
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SIN_CATEGORIA}>
                        Sin categoria
                      </SelectItem>
                      {categorias?.map((c) => (
                        <SelectItem
                          key={c.id_categoria}
                          value={String(c.id_categoria)}
                        >
                          {c.nombre_categoria}
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
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagen (opcional)</FormLabel>
                  <FormControl>
                    <div>
                      <input
                        ref={inputImagenRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) =>
                          manejarArchivo(e.target.files?.[0], field.onChange)
                        }
                      />
                      {field.value ? (
                        <div className="relative h-36 w-full overflow-hidden rounded-lg border border-border">
                          <ProductoImagen
                            src={field.value}
                            nombre={form.getValues('name') || 'Producto'}
                            className="h-full w-full"
                          />
                          {subir.isPending && (
                            <div className="absolute inset-0 grid place-items-center bg-black/60">
                              <Loader2 className="size-6 animate-spin text-primary" />
                            </div>
                          )}
                          <div className="absolute right-2 top-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => inputImagenRef.current?.click()}
                              disabled={subir.isPending}
                              className="rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/80"
                            >
                              Cambiar
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange('')}
                              disabled={subir.isPending}
                              aria-label="Quitar imagen"
                              className="grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur transition-colors hover:bg-destructive"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => inputImagenRef.current?.click()}
                          disabled={subir.isPending}
                          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-lowest text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
                        >
                          {subir.isPending ? (
                            <>
                              <Loader2 className="size-6 animate-spin text-primary" />
                              <span className="text-xs">Subiendo…</span>
                            </>
                          ) : (
                            <>
                              <ImagePlus className="size-6" />
                              <span className="text-xs">Subir imagen</span>
                              <span className="text-[11px] text-muted-foreground/70">
                                JPG, PNG, WEBP o GIF · max 5 MB
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="btn-heat w-full"
              disabled={mutacion.isPending || subir.isPending}
            >
              {mutacion.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
