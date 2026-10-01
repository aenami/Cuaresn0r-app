import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { bakeryApi, bakeryKeys } from './api'
import type { ArticuloPanaderia, CategoriaPanaderia } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorApi } from '@/features/billing/caja-comun'

type Editor = { id?: number; nombre: string }

export function CategoriasPanaderia({
  categorias,
  articulos,
}: {
  categorias: CategoriaPanaderia[]
  articulos: ArticuloPanaderia[]
}) {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const productosPorCategoria = new Map<number, number>()
  for (const articulo of articulos) {
    if (articulo.categoriaId !== null) {
      productosPorCategoria.set(
        articulo.categoriaId,
        (productosPorCategoria.get(articulo.categoriaId) ?? 0) + 1,
      )
    }
  }

  async function guardar() {
    if (!editor?.nombre.trim()) return
    setGuardando(true)
    try {
      if (editor.id) {
        await bakeryApi.actualizarCategoria(editor.id, { nombre: editor.nombre.trim() })
      } else {
        await bakeryApi.crearCategoria({ nombre: editor.nombre.trim() })
      }
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
      setEditor(null)
      toast.success(editor.id ? 'Categoría actualizada' : 'Categoría creada')
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(categoria: CategoriaPanaderia) {
    setGuardando(true)
    try {
      await bakeryApi.actualizarCategoria(categoria.id, { activa: !categoria.activa })
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
      toast.success(categoria.activa ? 'Categoría desactivada' : 'Categoría activada')
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(categoria: CategoriaPanaderia) {
    setGuardando(true)
    try {
      await bakeryApi.eliminarCategoria(categoria.id)
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all })
      setConfirmarEliminar(null)
      toast.success('Categoría eliminada')
    } catch (error) {
      toast.error(errorApi(error))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="space-y-5" aria-label="Categorías de panadería">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Categorías de productos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Todas están al mismo nivel. El tipo —pan, postre o externo— se define por separado al crear el producto.
            Para eliminar una categoría en uso, reasigna primero sus productos.
          </p>
        </div>
        <Button onClick={() => { setConfirmarEliminar(null); setEditor({ nombre: '' }) }}>
          Nueva categoría
        </Button>
      </div>

      {editor ? (
        <form
          className="space-y-4 rounded-lg bg-surface-high p-5"
          onSubmit={(event) => { event.preventDefault(); void guardar() }}
        >
          <h3 className="font-semibold">{editor.id ? 'Editar categoría' : 'Nueva categoría'}</h3>
          <div className="max-w-md">
            <Label htmlFor="pan-categoria-nombre">Nombre</Label>
            <Input
              id="pan-categoria-nombre"
              autoFocus
              required
              maxLength={60}
              placeholder="Ej. Bebidas, panes integrales"
              value={editor.nombre}
              onChange={(event) => setEditor({ ...editor, nombre: event.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={guardando || !editor.nombre.trim()}>
              {guardando ? 'Guardando…' : 'Guardar categoría'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}

      {categorias.length === 0 ? (
        <p className="rounded-lg bg-surface-low p-6 text-sm text-muted-foreground">
          Aún no hay categorías. Crea la primera para organizar los productos del catálogo.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg bg-surface-low px-4 sm:px-5">
          {categorias.map((categoria) => {
            const cantidad = productosPorCategoria.get(categoria.id) ?? 0
            const confirmando = confirmarEliminar === categoria.id
            return (
              <li key={categoria.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{categoria.nombre}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cantidad} {cantidad === 1 ? 'producto' : 'productos'} · {categoria.activa ? 'Activa' : 'Inactiva'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={guardando}
                      onClick={() => { setConfirmarEliminar(null); setEditor({ id: categoria.id, nombre: categoria.nombre }) }}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={guardando}
                      onClick={() => void cambiarEstado(categoria)}
                    >
                      {categoria.activa ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={guardando || cantidad > 0}
                      title={cantidad > 0 ? 'Reasigna sus productos antes de eliminarla' : undefined}
                      onClick={() => { setEditor(null); setConfirmarEliminar(categoria.id) }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
                {confirmando ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 px-3 py-2" role="group" aria-label={`Confirmar eliminación de ${categoria.nombre}`}>
                    <p className="mr-auto text-sm">¿Eliminar definitivamente «{categoria.nombre}»?</p>
                    <Button type="button" size="sm" variant="destructive" disabled={guardando} onClick={() => void eliminar(categoria)}>
                      {guardando ? 'Eliminando…' : 'Sí, eliminar'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={guardando} onClick={() => setConfirmarEliminar(null)}>
                      Cancelar
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
