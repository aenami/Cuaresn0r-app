import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { bakeryApi, bakeryKeys } from './api'
import type { ArticuloPanaderia, CategoriaPanaderia } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorApi } from '@/features/billing/caja-comun'

const grupos = [
  { tipo: 'PANADERIA', titulo: 'Panes' },
  { tipo: 'PASTELERIA', titulo: 'Pastelería' },
  { tipo: 'EXTERNO', titulo: 'Productos externos' },
] as const

type Editor = { id?: number; nombre: string; tipo: CategoriaPanaderia['tipo'] }

export function CategoriasPanaderia({
  categorias,
  articulos,
}: {
  categorias: CategoriaPanaderia[]
  articulos: ArticuloPanaderia[]
}) {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Editor | null>(null)
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
        await bakeryApi.crearCategoria({ nombre: editor.nombre.trim(), tipo: editor.tipo })
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

  return (
    <section className="space-y-5" aria-label="Categorías de panadería">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Categorías de productos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Organiza panes, postres y productos externos. Desactivar una categoría no borra sus productos.
          </p>
        </div>
        <Button onClick={() => setEditor({ nombre: '', tipo: 'PANADERIA' })}>
          Nueva categoría
        </Button>
      </div>

      {editor ? (
        <form
          className="space-y-4 rounded-lg bg-surface-high p-5"
          onSubmit={(event) => { event.preventDefault(); void guardar() }}
        >
          <h3 className="font-semibold">{editor.id ? 'Editar categoría' : 'Nueva categoría'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pan-categoria-nombre">Nombre</Label>
              <Input
                id="pan-categoria-nombre"
                autoFocus
                required
                maxLength={60}
                placeholder="Ej. Pan integral"
                value={editor.nombre}
                onChange={(event) => setEditor({ ...editor, nombre: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="pan-categoria-tipo">Tipo de producto</Label>
              <select
                id="pan-categoria-tipo"
                value={editor.tipo}
                disabled={!!editor.id}
                onChange={(event) => setEditor({ ...editor, tipo: event.target.value as Editor['tipo'] })}
                className="h-10 w-full rounded-md bg-surface-lowest px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
              >
                {grupos.map((grupo) => (
                  <option key={grupo.tipo} value={grupo.tipo}>{grupo.titulo}</option>
                ))}
              </select>
              {editor.id ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  El tipo no se cambia para conservar el historial de inventario.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={guardando || !editor.nombre.trim()}>
              {guardando ? 'Guardando…' : 'Guardar categoría'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {grupos.map((grupo) => {
          const propias = categorias.filter((categoria) => categoria.tipo === grupo.tipo)
          return (
            <div key={grupo.tipo} className="min-w-0 rounded-lg bg-surface-low p-4">
              <h3 className="font-heading text-lg font-semibold">{grupo.titulo}</h3>
              {propias.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Aún no hay categorías. Crea una para clasificar sus productos.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border/60">
                  {propias.map((categoria) => {
                    const cantidad = productosPorCategoria.get(categoria.id) ?? 0
                    return (
                      <li key={categoria.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{categoria.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {cantidad} {cantidad === 1 ? 'producto' : 'productos'} · {categoria.activa ? 'Activa' : 'Inactiva'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={guardando}
                            onClick={() => setEditor({ id: categoria.id, nombre: categoria.nombre, tipo: categoria.tipo })}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={guardando}
                            onClick={() => void cambiarEstado(categoria)}
                          >
                            {categoria.activa ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
