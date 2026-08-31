import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { categoriasQuery, productosQuery, useEliminarCategoria } from '@/features/catalogo/api'
import { CategoriaFormDialog } from '@/features/catalogo/categoria-form-dialog'
import type { Categoria } from '@/types/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { errorATexto } from './comun'
import { BotonNuevo } from './boton-nuevo'

export function SeccionCategorias({ esAdmin }: { esAdmin: boolean }) {
  const { data: categorias, isPending } = useQuery(categoriasQuery)
  const { data: productos } = useQuery(productosQuery)
  const eliminar = useEliminarCategoria()
  const [dialogo, setDialogo] = useState<{ abierto: boolean; categoria: Categoria | null }>({
    abierto: false,
    categoria: null,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Cargando categorias…</p>

  const productosPorCategoria = new Map<number, number>()
  for (const p of productos ?? []) {
    if (p.categoria_producto !== null) {
      productosPorCategoria.set(
        p.categoria_producto,
        (productosPorCategoria.get(p.categoria_producto) ?? 0) + 1,
      )
    }
  }

  return (
    <div>
      {esAdmin ? (
        <div className="mb-6 flex justify-end">
          <BotonNuevo onClick={() => setDialogo({ abierto: true, categoria: null })}>
            Nueva categoria
          </BotonNuevo>
        </div>
      ) : null}

      <div className="rounded-lg bg-surface-low">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead>Se prepara en</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              {esAdmin ? <TableHead className="w-40" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias?.map((categoria) => (
              <TableRow key={categoria.id_categoria}>
                <TableCell className="font-medium">
                  {categoria.nombre_categoria}
                  {categoria.es_adicion ? (
                    <span className="ml-2 rounded-md border border-primary/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Adiciones
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {categoria.descripcion_categoria ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      categoria.destino_categoria === 'BARRA'
                        ? 'bg-tertiary/15 text-tertiary'
                        : 'bg-primary/15 text-primary'
                    }
                  >
                    {categoria.destino_categoria === 'BARRA' ? 'Barra' : 'Cocina'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {productosPorCategoria.get(categoria.id_categoria) ?? 0}
                </TableCell>
                {esAdmin ? (
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDialogo({ abierto: true, categoria })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      disabled={eliminar.isPending}
                      onClick={() =>
                        eliminar
                          .mutateAsync(categoria.id_categoria)
                          .then(() => toast.success('Categoria eliminada'))
                          .catch((e: unknown) => toast.error(errorATexto(e)))
                      }
                    >
                      Eliminar
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CategoriaFormDialog
        categoria={dialogo.categoria}
        abierto={dialogo.abierto}
        onCerrar={() => setDialogo((d) => ({ ...d, abierto: false }))}
      />
    </div>
  )
}
