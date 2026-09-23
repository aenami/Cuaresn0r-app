import type { TipoTurno } from '@/types/api'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { nombresTurno } from './tipos-turno'

export function SelectorTipoTurno({ valor, onCambiar }: { valor: TipoTurno | ''; onCambiar: (tipo: TipoTurno) => void }) {
  return <div className="space-y-1.5">
    <Label htmlFor="tipo-turno">Tipo de turno</Label>
    <Select value={valor} onValueChange={tipo => onCambiar(tipo as TipoTurno)}>
      <SelectTrigger id="tipo-turno" className="w-full"><SelectValue placeholder="Selecciona el turno" /></SelectTrigger>
      <SelectContent>
        {Object.entries(nombresTurno).map(([tipo, nombre]) => <SelectItem key={tipo} value={tipo}>{nombre}</SelectItem>)}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">Tarde-noche y turno único requieren el conteo diario de inventario completo antes de cerrar caja.</p>
  </div>
}
