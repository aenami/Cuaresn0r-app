import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useActualizarEmpleado, useCrearEmpleado } from '@/features/nomina/api'
import type { Empleado } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorApi } from './comun'

// Alta/edicion de empleado. Se comparte entre el directorio de nomina y la
// ficha del empleado (/empleados/$id).
export function EmpleadoDialog({
  empleado,
  abierto,
  onCerrar,
}: {
  empleado: Empleado | null
  abierto: boolean
  onCerrar: () => void
}) {
  const crear = useCrearEmpleado()
  const actualizar = useActualizarEmpleado(empleado?.id_empleado ?? 0)
  const editando = empleado !== null

  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState('')

  useEffect(() => {
    if (abierto) {
      setNombre(empleado?.nombre_empleado ?? '')
      setApellido(empleado?.apellido_empleado ?? '')
      setFechaIngreso(empleado?.fecha_ingreso_empleado.slice(0, 10) ?? '')
    }
  }, [abierto, empleado])

  const valido = nombre.trim() !== '' && apellido.trim() !== ''
  const guardando = crear.isPending || actualizar.isPending

  function guardar() {
    if (!valido) return
    const datos = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      ...(fechaIngreso ? { fechaIngreso } : {}),
    }
    const accion = editando ? actualizar.mutateAsync(datos) : crear.mutateAsync(datos)
    accion
      .then(() => {
        toast.success(editando ? 'Empleado actualizado' : 'Empleado creado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">
            {editando ? 'Editar empleado' : 'Nuevo empleado'}
          </DialogTitle>
          <DialogDescription>Datos basicos del personal para nomina.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-nombre">Nombre</Label>
              <Input id="emp-nombre" value={nombre} maxLength={50} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-apellido">Apellido</Label>
              <Input id="emp-apellido" value={apellido} maxLength={60} onChange={(e) => setApellido(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-ingreso">Fecha de ingreso</Label>
            <Input id="emp-ingreso" type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
            <p className="text-xs text-muted-foreground">Si se deja vacio, ingresa hoy.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" className="btn-heat gap-2" disabled={!valido || guardando}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              {editando ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
