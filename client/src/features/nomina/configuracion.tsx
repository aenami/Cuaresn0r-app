import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Settings2 } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import {
  conceptosQuery,
  nominaConfigQuery,
  useCrearConcepto,
  useCrearValorConcepto,
  useGuardarNominaConfig,
} from '@/features/nomina/api'
import type { ConceptoNomina } from '@/types/api'
import { cn } from '@/lib/utils'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorApi, idCorto } from './comun'

// La config guarda las horas como @db.Time (medianoche UTC + la hora), asi que
// se lee en UTC para no correrla por la zona local.
function isoAHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function Configuracion() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">Configuracion</h1>
        <p className="micro-label mt-2">Reglas globales de nomina y catalogos</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <RecargoNocturno />
        <CatalogoConceptos />
      </div>
    </div>
  )
}

function RecargoNocturno() {
  const { data: config } = useQuery(nominaConfigQuery)
  const guardar = useGuardarNominaConfig()
  const [activo, setActivo] = useState(false)
  const [pct, setPct] = useState('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')

  useEffect(() => {
    if (!config) return
    setActivo(config.aplica_recargo_nocturno)
    setPct(config.porcentaje_recargo_nocturno ? String(Number(config.porcentaje_recargo_nocturno)) : '')
    setInicio(isoAHora(config.hora_inicio_nocturno))
    setFin(isoAHora(config.hora_fin_nocturno))
  }, [config])

  const pctNum = Number(pct)
  const valido = !activo || (pct !== '' && !Number.isNaN(pctNum) && pctNum >= 0 && pctNum <= 100 && inicio !== '' && fin !== '' && inicio !== fin)

  function guardarConfig() {
    if (!valido) return
    const datos = activo
      ? { aplicaRecargoNocturno: true, porcentajeRecargo: pctNum, horaInicio: inicio, horaFin: fin }
      : { aplicaRecargoNocturno: false }
    guardar
      .mutateAsync(datos)
      .then(() => toast.success('Configuracion guardada (nueva version)'))
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <section className="h-fit rounded-2xl border border-border bg-surface-high p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Recargo nocturno</h2>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          onClick={() => setActivo((v) => !v)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-150 ease-out-quart',
            activo ? 'bg-primary' : 'bg-surface-lowest',
          )}
        >
          <span
            className={cn(
              'block size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out-quart',
              activo ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      <div className={cn('mt-5 space-y-4', !activo && 'pointer-events-none opacity-40')}>
        <div className="space-y-1.5">
          <Label htmlFor="rec-pct">Recargo (%)</Label>
          <Input
            id="rec-pct"
            type="number"
            min={0}
            max={100}
            step={0.5}
            inputMode="decimal"
            placeholder="35"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rec-inicio">Inicio</Label>
            <Input id="rec-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-fin">Fin</Label>
            <Input id="rec-fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Se aplica a las horas trabajadas dentro de la franja (puede cruzar medianoche, ej. 22:00–06:00).
        </p>
      </div>

      <Button
        className="mt-5 h-11 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
        variant="secondary"
        disabled={!valido || guardar.isPending}
        onClick={guardarConfig}
      >
        {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
        Guardar configuracion
      </Button>
    </section>
  )
}

function CatalogoConceptos() {
  const { data: conceptos } = useQuery(conceptosQuery)
  const [dialogoNuevo, setDialogoNuevo] = useState(false)
  const [valorDe, setValorDe] = useState<ConceptoNomina | null>(null)

  return (
    <section className="rounded-2xl border border-border bg-surface-high p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Catalogo de conceptos</h2>
        <Button
          className="btn-heat h-9 gap-1.5 font-heading text-xs font-semibold uppercase tracking-wide"
          onClick={() => setDialogoNuevo(true)}
        >
          <Plus className="size-4" /> Nuevo concepto
        </Button>
      </div>

      {(conceptos ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No hay conceptos. Crea el primero (ej. auxilio de transporte).
        </p>
      ) : (
        <>
          {/* Telefono: tarjetas */}
          <ul className="divide-y divide-border/50 md:hidden">
            {(conceptos ?? []).map((c) => {
              const valor = c.valores?.[0]
              return (
                <li key={c.id_conceptoNomina} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.nombre_conceptoNomina}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          c.tipo_conceptoNomina === 'INGRESO'
                            ? 'border-tertiary/40 text-tertiary'
                            : 'border-destructive/40 text-destructive',
                        )}
                      >
                        {c.tipo_conceptoNomina === 'INGRESO' ? 'Ingreso' : 'Deduccion'}
                      </span>
                      <span className="rounded-md bg-surface-lowest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {c.aplica_automaticamente ? 'Auto' : 'Manual'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-semibold tabular-nums">
                      {valor ? formatearPrecio(valor.monto_valorConceptoNomina) : '—'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-primary"
                      title="Nuevo valor"
                      onClick={() => setValorDe(c)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Tablet / desktop: tabla */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="micro-label py-2 pr-3">ID</th>
                <th className="micro-label py-2 pr-4">Descripcion</th>
                <th className="micro-label py-2 pr-4">Tipo</th>
                <th className="micro-label py-2 pr-4">Disparo</th>
                <th className="micro-label py-2 pr-4 text-right">Valor</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {(conceptos ?? []).map((c) => {
                const valor = c.valores?.[0]
                return (
                  <tr key={c.id_conceptoNomina} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pr-3 tabular-nums text-muted-foreground">{idCorto(c.id_conceptoNomina)}</td>
                    <td className="py-3 pr-4 font-medium">{c.nombre_conceptoNomina}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          c.tipo_conceptoNomina === 'INGRESO'
                            ? 'border-tertiary/40 text-tertiary'
                            : 'border-destructive/40 text-destructive',
                        )}
                      >
                        {c.tipo_conceptoNomina === 'INGRESO' ? 'Ingreso' : 'Deduccion'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md bg-surface-lowest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {c.aplica_automaticamente ? 'Auto' : 'Manual'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {valor ? formatearPrecio(valor.monto_valorConceptoNomina) : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-primary"
                        title="Nuevo valor"
                        onClick={() => setValorDe(c)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <ConceptoDialog abierto={dialogoNuevo} onCerrar={() => setDialogoNuevo(false)} />
      <ValorConceptoDialog concepto={valorDe} onCerrar={() => setValorDe(null)} />
    </section>
  )
}

function ConceptoDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const crear = useCrearConcepto()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'INGRESO' | 'DEDUCCION'>('INGRESO')
  const [auto, setAuto] = useState(false)
  const [valor, setValor] = useState('')

  useEffect(() => {
    if (abierto) {
      setNombre('')
      setTipo('INGRESO')
      setAuto(false)
      setValor('')
    }
  }, [abierto])

  const valorNum = Number(valor)
  const valido = nombre.trim() !== '' && valor !== '' && !Number.isNaN(valorNum) && valorNum > 0

  function guardar() {
    if (!valido) return
    crear
      .mutateAsync({
        nombre: nombre.trim(),
        tipo,
        aplicaAutomaticamente: auto,
        ...(auto ? { unidadCalculo: 'DIA_TRABAJADO' as const } : {}),
        valorInicial: valorNum,
      })
      .then(() => {
        toast.success('Concepto creado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Nuevo concepto</DialogTitle>
          <DialogDescription>Auxilios, incentivos o deducciones para la nomina.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="con-nombre">Nombre</Label>
            <Input id="con-nombre" value={nombre} maxLength={50} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'INGRESO' | 'DEDUCCION')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INGRESO">Ingreso</SelectItem>
                  <SelectItem value="DEDUCCION">Deduccion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="con-valor">Valor</Label>
              <Input
                id="con-valor"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-primary" />
            Aplicar automaticamente por dia trabajado (al cerrar cada jornada)
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" className="btn-heat gap-2" disabled={!valido || crear.isPending}>
              {crear.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ValorConceptoDialog({ concepto, onCerrar }: { concepto: ConceptoNomina | null; onCerrar: () => void }) {
  const crearValor = useCrearValorConcepto(concepto?.id_conceptoNomina ?? 0)
  const [monto, setMonto] = useState('')

  useEffect(() => {
    setMonto(concepto?.valores?.[0] ? String(Number(concepto.valores[0].monto_valorConceptoNomina)) : '')
  }, [concepto])

  const montoNum = Number(monto)
  const valido = monto !== '' && !Number.isNaN(montoNum) && montoNum > 0

  function guardar() {
    if (!valido || !concepto) return
    crearValor
      .mutateAsync(montoNum)
      .then(() => {
        toast.success('Nuevo valor guardado')
        onCerrar()
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <Dialog open={concepto !== null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight">Nuevo valor</DialogTitle>
          <DialogDescription>
            {concepto?.nombre_conceptoNomina}: crea una version nueva del valor (desactiva la anterior).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="val-monto">Monto</Label>
          <Input
            id="val-monto"
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button className="btn-heat gap-2" disabled={!valido || crearValor.isPending} onClick={guardar}>
            {crearValor.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
