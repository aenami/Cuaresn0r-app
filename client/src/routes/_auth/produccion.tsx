import { createFileRoute } from '@tanstack/react-router'
import { HojaProduccionPanaderia } from '@/features/panaderia/hoja-produccion'

export const Route = createFileRoute('/_auth/produccion')({
  component: HojaProduccionPanaderia,
})
