import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { articulosQuery, bakeryApi, bakeryKeys } from "./api";
import type { ArticuloPanaderia, TipoArticulo } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatearPrecio } from "@/lib/formato";
import { errorApi } from "@/features/billing/caja-comun";

const categorias = {
  PANADERIA: "Panadería · panes",
  PASTELERIA: "Pastelería · postres",
  EXTERNO: "Bebidas y productos externos",
  INSUMO: "Insumos",
};
export function CatalogoPanaderia() {
  const { data, isPending, isError, refetch } = useQuery(articulosQuery);
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<{
    id?: number;
    nombre: string;
    precio: string;
    tipo: TipoArticulo;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const productos = data?.filter(
    (a) =>
      a.tipo !== "INSUMO" &&
      a.nombre
        .toLocaleLowerCase("es-CO")
        .includes(busqueda.toLocaleLowerCase("es-CO")),
  );
  async function guardar() {
    if (!form) return;
    setGuardando(true);
    try {
      const precioVenta = Number(form.precio);
      if (form.id)
        await bakeryApi.actualizarArticulo(form.id, {
          nombre: form.nombre.trim(),
          precioVenta,
        });
      else
        await bakeryApi.crearArticulo({
          nombre: form.nombre.trim(),
          tipo: form.tipo,
          precioVenta,
          unidad: "UNIDADES",
        });
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all });
      setForm(null);
      toast.success("Producto guardado en panadería");
    } catch (e) {
      toast.error(errorApi(e));
    } finally {
      setGuardando(false);
    }
  }
  async function cambiarEstado(a: ArticuloPanaderia) {
    setGuardando(true);
    try {
      await bakeryApi.actualizarArticulo(a.id, { activo: !a.activo });
      await queryClient.invalidateQueries({ queryKey: bakeryKeys.all });
    } catch (e) {
      toast.error(errorApi(e));
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Catálogo de panadería
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Productos exclusivos de mostrador. Crear aquí no agrega existencias
            ni modifica el catálogo del restaurante.
          </p>
        </div>
        <Button
          onClick={() => setForm({ nombre: "", precio: "", tipo: "PANADERIA" })}
        >
          Nuevo producto
        </Button>
      </header>
      <Input
        aria-label="Buscar producto de panadería"
        placeholder="Buscar panes, postres o bebidas…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-md"
      />
      {form && (
        <form
          className="space-y-4 rounded-lg bg-surface-high p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <h2 className="font-semibold">
            {form.id ? "Editar producto" : "Nuevo producto"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="catalogo-pan-nombre">Nombre</Label>
              <Input
                id="catalogo-pan-nombre"
                autoFocus
                required
                maxLength={80}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="catalogo-pan-categoria">Categoría</Label>
              <select
                id="catalogo-pan-categoria"
                disabled={!!form.id}
                value={form.tipo}
                onChange={(e) =>
                  setForm({ ...form, tipo: e.target.value as TipoArticulo })
                }
                className="h-10 w-full rounded-md bg-surface-lowest px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                {(["PANADERIA", "PASTELERIA", "EXTERNO"] as const).map(
                  (tipo) => (
                    <option key={tipo} value={tipo}>
                      {categorias[tipo]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <Label htmlFor="catalogo-pan-precio">Precio de venta COP</Label>
              <Input
                id="catalogo-pan-precio"
                type="number"
                min={0}
                step={1}
                required
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={
                guardando ||
                !form.nombre.trim() ||
                form.precio === "" ||
                !Number.isInteger(Number(form.precio)) ||
                Number(form.precio) < 0
              }
            >
              {guardando ? "Guardando…" : "Guardar producto"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {isPending ? (
        <div className="h-48 animate-pulse rounded-lg bg-surface-high" />
      ) : isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">No se pudo cargar el catálogo.</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !productos?.length ? (
        <p className="text-muted-foreground">
          No hay productos que coincidan. Crea un producto para empezar.
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs text-muted-foreground lg:hidden">
            Desliza la tabla para ver precios, estado y acciones →
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3 text-right">Precio</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-3 font-semibold">{a.nombre}</td>
                    <td className="p-3">{categorias[a.tipo]}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatearPrecio(a.precioVenta)}
                    </td>
                    <td className="p-3">{a.activo ? "Activo" : "Inactivo"}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm({
                            id: a.id,
                            nombre: a.nombre,
                            tipo: a.tipo,
                            precio: a.precioVenta,
                          })
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={guardando}
                        onClick={() => void cambiarEstado(a)}
                      >
                        {a.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
