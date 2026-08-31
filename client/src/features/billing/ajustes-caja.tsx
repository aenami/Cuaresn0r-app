import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Loader2, PiggyBank, Plus, Receipt, Settings2 } from 'lucide-react'
import type { Caja } from '@/types/api'
import {
  cajasQuery,
  configFacturacionQuery,
  negocioConfigQuery,
  useCrearCaja,
  useGuardarConfig,
  useGuardarNegocio,
  useRenombrarCaja,
} from '@/features/billing/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorApi } from './caja-comun'

// ---- Ajustes (ADMIN): datos del negocio + configuracion de facturacion + cajas ----

export function Ajustes() {
  return (
    <div className="space-y-8">
      <PanelNegocio />
      <div className="grid gap-8 lg:grid-cols-2">
        <PanelConfig />
        <PanelCajas />
      </div>
    </div>
  )
}

function PanelNegocio() {
  const { data: negocio } = useQuery(negocioConfigQuery)
  const guardar = useGuardarNegocio()
  const [form, setForm] = useState({ nombre: '', nit: '', direccion: '', telefono: '' })

  // Precarga los campos con lo vigente cuando llega del backend.
  useEffect(() => {
    if (negocio) {
      setForm({
        nombre: negocio.nombre_negocio,
        nit: negocio.nit_negocio ?? '',
        direccion: negocio.direccion_negocio ?? '',
        telefono: negocio.telefono_negocio ?? '',
      })
    }
  }, [negocio])

  const valido = form.nombre.trim() !== '' && form.nombre.trim().length <= 80

  function guardarNegocio() {
    if (!valido) return
    guardar
      .mutateAsync({
        nombre: form.nombre.trim(),
        nit: form.nit.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
      })
      .then(() => toast.success('Datos del negocio actualizados'))
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <section className="rounded-2xl border-l-2 border-primary bg-surface-high p-6">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
        <Building2 className="size-4 text-primary" /> Datos del negocio
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Salen en el encabezado de cada factura. Cada cambio crea una version nueva.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="neg-nombre">Razon social</Label>
          <Input
            id="neg-nombre"
            maxLength={80}
            placeholder="Ej. CorePOS Restaurante"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-nit">NIT (opcional)</Label>
          <Input
            id="neg-nit"
            maxLength={30}
            value={form.nit}
            onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neg-tel">Telefono (opcional)</Label>
          <Input
            id="neg-tel"
            maxLength={30}
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="neg-dir">Direccion (opcional)</Label>
          <Input
            id="neg-dir"
            maxLength={120}
            value={form.direccion}
            onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
          />
        </div>
      </div>
      <Button
        className="btn-heat mt-4 h-11 gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
        disabled={!valido || guardar.isPending}
        onClick={guardarNegocio}
      >
        {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
        Guardar datos
      </Button>
    </section>
  )
}

function PanelConfig() {
  const { data: config } = useQuery(configFacturacionQuery)
  const guardar = useGuardarConfig()
  const [servicio, setServicio] = useState('')
  const [impuestos, setImpuestos] = useState('')

  const s = Number(servicio)
  const i = Number(impuestos)
  const valido =
    servicio !== '' && impuestos !== '' && !Number.isNaN(s) && !Number.isNaN(i) && s >= 0 && s <= 100 && i >= 0 && i <= 100

  function guardarConfig() {
    if (!valido) return
    guardar
      .mutateAsync({ porcentajeServicio: s, porcentajeImpuestos: i })
      .then(() => {
        toast.success('Configuracion actualizada')
        setServicio('')
        setImpuestos('')
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border-l-2 border-tertiary bg-surface-high p-6">
        <p className="micro-label flex items-center gap-1.5">
          <Settings2 className="size-3.5" /> Facturacion vigente
        </p>
        <div className="mt-3 flex gap-8">
          <div>
            <p className="font-heading text-3xl font-semibold tabular-nums tracking-tighter">
              {config ? Number(config.porcentaje_servicio) : '—'}%
            </p>
            <p className="micro-label mt-1">Servicio / propina</p>
          </div>
          <div>
            <p className="font-heading text-3xl font-semibold tabular-nums tracking-tighter">
              {config ? Number(config.porcentaje_impuestos) : '—'}%
            </p>
            <p className="micro-label mt-1">Impuestos</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-high p-6">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Nueva version</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada cambio crea una version nueva; las facturas ya emitidas no se tocan.
        </p>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pct-servicio">Servicio %</Label>
              <Input
                id="pct-servicio"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                placeholder={config ? String(Number(config.porcentaje_servicio)) : '0'}
                value={servicio}
                onChange={(e) => setServicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pct-impuestos">Impuestos %</Label>
              <Input
                id="pct-impuestos"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                placeholder={config ? String(Number(config.porcentaje_impuestos)) : '0'}
                value={impuestos}
                onChange={(e) => setImpuestos(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="btn-heat h-11 w-full gap-2 font-heading text-sm font-semibold uppercase tracking-wide"
            disabled={!valido || guardar.isPending}
            onClick={guardarConfig}
          >
            {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
            Guardar version
          </Button>
        </div>
      </section>
    </div>
  )
}

function PanelCajas() {
  const { data: cajas } = useQuery(cajasQuery)
  const crear = useCrearCaja()
  const [nombre, setNombre] = useState('')

  const valido = nombre.trim() !== '' && nombre.trim().length <= 30

  function crearCaja() {
    if (!valido) return
    crear
      .mutateAsync(nombre.trim())
      .then(() => {
        toast.success('Caja creada')
        setNombre('')
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface-high p-6">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          <PiggyBank className="mr-2 inline size-4 text-muted-foreground" />
          Nueva caja
        </h2>
        <div className="mt-4 flex gap-2">
          <Input placeholder="Nombre (ej. Caja principal)" maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Button variant="secondary" className="gap-1.5" disabled={!valido || crear.isPending} onClick={crearCaja}>
            {crear.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Crear
          </Button>
        </div>
      </section>

      <ul className="space-y-2">
        {(cajas ?? []).map((caja) => (
          <FilaCaja key={caja.id_caja} caja={caja} />
        ))}
      </ul>
    </div>
  )
}

function FilaCaja({ caja }: { caja: Caja }) {
  const renombrar = useRenombrarCaja(caja.id_caja)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(caja.nombre_caja)
  const ocupada = (caja.turnos ?? []).length > 0

  function guardar() {
    const limpio = nombre.trim()
    if (limpio === '' || limpio === caja.nombre_caja) {
      setEditando(false)
      setNombre(caja.nombre_caja)
      return
    }
    renombrar
      .mutateAsync(limpio)
      .then(() => {
        toast.success('Caja renombrada')
        setEditando(false)
      })
      .catch((e: unknown) => toast.error(errorApi(e)))
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-surface-high px-4 py-3">
      {editando ? (
        <>
          <Input className="h-8" maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="secondary" disabled={renombrar.isPending} onClick={guardar}>
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditando(false)
                setNombre(caja.nombre_caja)
              }}
            >
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <Receipt className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{caja.nombre_caja}</span>
            {ocupada && <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">En uso</span>}
          </span>
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setEditando(true)}>
            Renombrar
          </Button>
        </>
      )}
    </li>
  )
}
