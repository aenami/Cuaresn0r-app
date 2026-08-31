import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ConceptoNomina,
  ConceptoNominaEmpleado,
  ConfiguracionNomina,
  ConfiguracionPropinas,
  Empleado,
  EstadoEmpleado,
  EstadoJornada,
  Jornada,
  MetodoPagoNomina,
  MetodoReparto,
  MiNominaResumen,
  PagoNomina,
  PropinasPreview,
  SaldoEmpleado,
  SaldoResumen,
  TarifaEmpleado,
  TipoConceptoNomina,
  UnidadCalculoConceptoNomina,
} from '@/types/api'

// ---- queries: empleados ----

export function empleadosQuery(estado?: EstadoEmpleado) {
  return queryOptions({
    queryKey: ['nomina', 'empleados', estado ?? 'todos'],
    queryFn: () => api.get<Empleado[]>(`/auth/empleados${estado ? `?estado=${estado}` : ''}`),
  })
}

export function empleadoQuery(idEmpleado: number) {
  return queryOptions({
    queryKey: ['nomina', 'empleado', idEmpleado],
    queryFn: () => api.get<Empleado>(`/auth/empleados/${idEmpleado}`),
  })
}

// Saldo pendiente de todos, para la columna del directorio (un solo request).
export const saldosNominaQuery = queryOptions({
  queryKey: ['nomina', 'saldos'],
  queryFn: () => api.get<SaldoResumen[]>('/payroll/empleados/saldos'),
})

export function saldoEmpleadoQuery(idEmpleado: number) {
  return queryOptions({
    queryKey: ['nomina', 'saldo', idEmpleado],
    queryFn: () => api.get<SaldoEmpleado>(`/payroll/empleados/${idEmpleado}/saldo`),
  })
}

export function pagosEmpleadoQuery(idEmpleado: number) {
  return queryOptions({
    queryKey: ['nomina', 'pagos', idEmpleado],
    queryFn: () => api.get<PagoNomina[]>(`/payroll/empleados/${idEmpleado}/pagos`),
  })
}

export function tarifasEmpleadoQuery(idEmpleado: number) {
  return queryOptions({
    queryKey: ['nomina', 'tarifas', idEmpleado],
    queryFn: () => api.get<TarifaEmpleado[]>(`/payroll/empleados/${idEmpleado}/tarifas`),
  })
}

export function conceptosEmpleadoQuery(idEmpleado: number) {
  return queryOptions({
    queryKey: ['nomina', 'conceptos-empleado', idEmpleado],
    queryFn: () => api.get<ConceptoNominaEmpleado[]>(`/payroll/empleados/${idEmpleado}/conceptos`),
  })
}

// ---- autoservicio: mi propia nomina (cualquier rol; solo lectura) ----

// El empleado sale del JWT en el backend, no de un parametro: cada usuario ve
// exclusivamente lo suyo.
export const miNominaQuery = queryOptions({
  queryKey: ['nomina', 'mi-nomina'],
  queryFn: () => api.get<MiNominaResumen>('/payroll/me/resumen'),
})

// ---- queries: jornadas ----

export function jornadasQuery(params: { empleado?: number; estado?: EstadoJornada } = {}) {
  const qs = new URLSearchParams()
  if (params.empleado !== undefined) qs.set('empleado', String(params.empleado))
  if (params.estado !== undefined) qs.set('estado', params.estado)
  const suffix = qs.toString() ? `?${qs}` : ''
  return queryOptions({
    queryKey: ['nomina', 'jornadas', params.empleado ?? 'todos', params.estado ?? 'todos'],
    queryFn: () => api.get<Jornada[]>(`/payroll/jornadas${suffix}`),
    refetchInterval: params.estado === 'ABIERTA' ? 20_000 : undefined,
  })
}

// ---- queries: catalogo y config ----

export const conceptosQuery = queryOptions({
  queryKey: ['nomina', 'conceptos'],
  queryFn: () => api.get<ConceptoNomina[]>('/payroll/conceptos'),
})

export const nominaConfigQuery = queryOptions({
  queryKey: ['nomina', 'config'],
  queryFn: () => api.get<ConfiguracionNomina>('/payroll/config'),
})

// ---- invalidacion ----

function useInvalidarNomina() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['nomina'] })
}

// Un pago de nomina en EFECTIVO genera un EGRESO en la caja: refrescar billing.
function useInvalidarNominaYCaja() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['nomina'] })
    void queryClient.invalidateQueries({ queryKey: ['billing'] })
  }
}

// ---- mutaciones: empleados ----

export function useCrearEmpleado() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { nombre: string; apellido: string; fechaIngreso?: string }) =>
      api.post<Empleado>('/auth/empleados', datos),
    onSuccess: invalidar,
  })
}

export function useActualizarEmpleado(idEmpleado: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { nombre?: string; apellido?: string; fechaIngreso?: string }) =>
      api.patch<Empleado>(`/auth/empleados/${idEmpleado}`, datos),
    onSuccess: invalidar,
  })
}

export function useDesactivarEmpleado(idEmpleado: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: () => api.patch<Empleado>(`/auth/empleados/${idEmpleado}/deactivate`),
    onSuccess: invalidar,
  })
}

export function useReactivarEmpleado(idEmpleado: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: () => api.patch<Empleado>(`/auth/empleados/${idEmpleado}/reactivate`),
    onSuccess: invalidar,
  })
}

// ---- mutaciones: jornadas (marcacion, cierre, correccion) ----

export function useMarcar() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { idEmpleado: number; fechaHora?: string }) =>
      api.post<{ marcacion: { tipo_marcacion: string }; jornada: Jornada }>('/payroll/jornadas/marcar', datos),
    onSuccess: invalidar,
  })
}

export function useCerrarJornada() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (idJornada: number) => api.patch(`/payroll/jornadas/${idJornada}/cerrar`),
    onSuccess: invalidar,
  })
}

export function useDeshacerMarcacion() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (idJornada: number) => api.delete(`/payroll/jornadas/${idJornada}/marcaciones/ultima`),
    onSuccess: invalidar,
  })
}

export function useReabrirJornada() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (idJornada: number) => api.patch(`/payroll/jornadas/${idJornada}/reabrir`),
    onSuccess: invalidar,
  })
}

// ---- mutaciones: tarifas, pagos, conceptos aplicados ----

export function useCrearTarifa(idEmpleado: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { valorHora: number; fechaInicio?: string }) =>
      api.post<TarifaEmpleado>(`/payroll/empleados/${idEmpleado}/tarifas`, datos),
    onSuccess: invalidar,
  })
}

export function useRegistrarPagoNomina(idEmpleado: number) {
  const invalidar = useInvalidarNominaYCaja()
  return useMutation({
    mutationFn: (datos: { monto: number; metodo: MetodoPagoNomina; observacion?: string }) =>
      api.post<{ pago: PagoNomina; nuevoSaldo: string }>(`/payroll/empleados/${idEmpleado}/pagos`, datos),
    onSuccess: invalidar,
  })
}

export function useAplicarConcepto(idEmpleado: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { idConcepto: number; cantidad?: number; fecha?: string; observacion?: string }) =>
      api.post<ConceptoNominaEmpleado>(`/payroll/empleados/${idEmpleado}/conceptos`, datos),
    onSuccess: invalidar,
  })
}

// ---- mutaciones: catalogo de conceptos y config global ----

export function useCrearConcepto() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: {
      nombre: string
      tipo: TipoConceptoNomina
      aplicaAutomaticamente?: boolean
      unidadCalculo?: UnidadCalculoConceptoNomina
      valorInicial?: number
    }) => api.post<ConceptoNomina>('/payroll/conceptos', datos),
    onSuccess: invalidar,
  })
}

export function useCrearValorConcepto(idConcepto: number) {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (monto: number) => api.post(`/payroll/conceptos/${idConcepto}/valores`, { monto }),
    onSuccess: invalidar,
  })
}

export function useGuardarNominaConfig() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: {
      aplicaRecargoNocturno: boolean
      porcentajeRecargo?: number
      horaInicio?: string
      horaFin?: string
    }) => api.post<ConfiguracionNomina>('/payroll/config', datos),
    onSuccess: invalidar,
  })
}

// ---- reparto de propinas ----

// pctCasa: retencion del local a previsualizar en vivo (lo que el ADMIN esta
// ajustando). Va en la queryKey para refetchar al cambiar el switch/porcentaje.
export function propinasPreviewQuery(fecha: string, metodo: MetodoReparto, excluidos: number[], pctCasa: number) {
  const params = new URLSearchParams({ fecha, metodo, pctCasa: String(pctCasa) })
  if (excluidos.length > 0) params.set('excluidos', excluidos.join(','))
  return queryOptions({
    queryKey: ['nomina', 'propinas', fecha, metodo, excluidos.join(','), pctCasa],
    queryFn: () => api.get<PropinasPreview>(`/payroll/propinas/preview?${params.toString()}`),
  })
}

export function useRepartirPropinas() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (body: { fecha: string; metodo: MetodoReparto; excluidos?: number[]; pctCasa?: number }) =>
      api.post<{ fecha: string; metodo: MetodoReparto; empleados: number; total: number }>(
        '/payroll/propinas',
        body,
      ),
    onSuccess: invalidar,
  })
}

export function useDeshacerPropinas() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (fecha: string) => api.delete(`/payroll/propinas?fecha=${encodeURIComponent(fecha)}`),
    onSuccess: invalidar,
  })
}

// ---- configuracion de propinas (retencion del restaurante) ----

export const propinasConfigQuery = queryOptions({
  queryKey: ['nomina', 'propinas', 'config'],
  queryFn: () => api.get<ConfiguracionPropinas>('/payroll/propinas/config'),
})

export function useGuardarPropinasConfig() {
  const invalidar = useInvalidarNomina()
  return useMutation({
    mutationFn: (datos: { retieneCasa: boolean; porcentajeCasa?: number }) =>
      api.post<ConfiguracionPropinas>('/payroll/propinas/config', datos),
    onSuccess: invalidar,
  })
}
