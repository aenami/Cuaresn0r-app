import { useEffect, useState } from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  BookOpen,
  Croissant,
  Boxes,
  CircleDollarSign,
  Flame,
  Hash,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Printer,
  ReceiptText,
  UserCog,
  Users,
  Wallet,
  ArrowRightLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SesionUsuario } from '@/stores/auth.store'
import { useAuthStore, useEsAdmin, useEsCaja, tokenVigente } from '@/stores/auth.store'
import { CambiarPasswordDialog } from '@/features/usuarios/cambiar-password-dialog'
import { Button } from '@/components/ui/button'
import type { LinkProps } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth')({
  beforeLoad: ({ location }) => {
    if (!tokenVigente(useAuthStore.getState().token)) {
      useAuthStore.getState().logout()
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AppShell,
})

type ItemNav = {
  etiqueta: string
  to: LinkProps['to']
  icono: LucideIcon
  soloAdmin?: boolean
  soloCaja?: boolean
  area?: 'RESTAURANTE' | 'PANADERIA'
  ocultarMesero?: boolean
}

const NAVEGACION: ItemNav[] = [
  // Inicio no aplica al MESERO: su `/` redirige a /mesas, asi que el enlace
  // seria un rebote inutil. Lo ocultamos de su barra.
  { etiqueta: 'Inicio', to: '/', icono: LayoutDashboard, ocultarMesero: true, area: 'RESTAURANTE' },
  { etiqueta: 'Pedidos', to: '/mesas', icono: Hash, area: 'RESTAURANTE' },
  { etiqueta: 'Panaderia', to: '/panaderia', icono: Croissant, soloCaja: true, area: 'PANADERIA' },
  { etiqueta: 'Traslados', to: '/traslados', icono: ArrowRightLeft, soloCaja: true, area: 'RESTAURANTE' },
  { etiqueta: 'Caja', to: '/caja', icono: Wallet, soloCaja: true, area: 'RESTAURANTE' },
  { etiqueta: 'Cuentas por pagar', to: '/cuentas-por-pagar', icono: ReceiptText, soloCaja: true, area: 'RESTAURANTE' },
  { etiqueta: 'Nomina', to: '/nomina', icono: Users, soloCaja: true, area: 'RESTAURANTE' },
  { etiqueta: 'Mi nomina', to: '/mi-nomina', icono: CircleDollarSign },
  { etiqueta: 'Catalogo', to: '/catalogo', icono: BookOpen, area: 'RESTAURANTE' },
  { etiqueta: 'Inventario', to: '/inventario', icono: Boxes, area: 'RESTAURANTE' },
  { etiqueta: 'Impresoras', to: '/impresoras', icono: Printer, soloAdmin: true },
  { etiqueta: 'Usuarios', to: '/usuarios', icono: UserCog, soloAdmin: true },
]

// Contenido de la barra lateral, compartido entre el aside fijo (desktop) y
// el drawer deslizable (telefono). `onNavegar` cierra el drawer al tocar un
// enlace; en desktop se pasa undefined.
function ContenidoSidebar({
  navegacion,
  usuario,
  onLogout,
  onNavegar,
  onCambiarPassword,
}: {
  navegacion: ItemNav[]
  usuario: SesionUsuario | null
  onLogout: () => void
  onNavegar?: () => void
  onCambiarPassword: () => void
}) {
  return (
    <>
      {/* Marca / terminal */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/15">
          <Flame className="size-5 text-primary" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="font-heading text-lg font-semibold leading-none tracking-tighter text-primary">
            CorePOS
          </p>
          <p className="micro-label mt-1.5">Terminal 01</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 py-2" aria-label="Principal">
        {navegacion.map((item) => (
          <Link
            key={item.etiqueta}
            to={item.to}
            onClick={onNavegar}
            className="flex items-center gap-3 border-l-2 border-transparent px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-high/50 hover:text-foreground"
            activeProps={{ className: 'border-primary bg-primary/10 font-semibold text-primary' }}
            activeOptions={{ exact: item.to === '/' }}
          >
            <item.icono className="size-[18px]" />
            {item.etiqueta}
          </Link>
        ))}
      </nav>

      {/* Usuario / cambiar clave / cerrar sesion */}
      <div className="flex items-center justify-between gap-2 bg-surface-lowest px-5 py-3">
        <div className="min-w-0">
          <p className="micro-label">{usuario?.rolNombre ?? 'SIN ROL'}</p>
          <p className="text-xs text-muted-foreground">Sesion activa</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onCambiarPassword()}
            aria-label="Cambiar contraseña"
            title="Cambiar contraseña"
          >
            <KeyRound className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onLogout()}
            aria-label="Cerrar sesion"
            title="Cerrar sesion"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </>
  )
}

function AppShell() {
  const usuario = useAuthStore((s) => s.usuario)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const esAdmin = useEsAdmin()
  const esCaja = useEsCaja()
  const esMesero = usuario?.rolNombre === 'MESERO'
  const navegacion = NAVEGACION.filter(
    (item) =>
      (!item.soloAdmin || esAdmin) &&
      (!item.soloCaja || esCaja) &&
      (!item.ocultarMesero || !esMesero) &&
      (!item.area || esAdmin || item.area === usuario?.area),
  )
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cambiarPassAbierto, setCambiarPassAbierto] = useState(false)

  // Si la sesion muere en caliente (401 del api client), se expulsa al login.
  useEffect(() => {
    if (!token) navigate({ to: '/login' })
  }, [token, navigate])

  return (
    <div className="flex min-h-svh bg-background">
      {/* Barra lateral fija en tablet/desktop */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col self-start overflow-y-auto bg-surface-low md:flex">
        <ContenidoSidebar
          navegacion={navegacion}
          usuario={usuario}
          onLogout={logout}
          onCambiarPassword={() => setCambiarPassAbierto(true)}
        />
      </aside>

      {/* Columna de contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior en telefono: menu + marca */}
        <header className="flex items-center justify-between bg-surface-low px-3 py-2.5 md:hidden">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menu"
              className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-high hover:text-foreground"
            >
              <Menu className="size-5" />
            </button>
            <div className="grid size-8 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/15">
              <Flame className="size-4 text-primary" strokeWidth={2.5} />
            </div>
            <span className="font-heading text-lg font-semibold tracking-tighter text-primary">
              CorePOS
            </span>
          </div>
          <span className="micro-label">{usuario?.rolNombre}</span>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Drawer deslizable en telefono */}
      <DialogPrimitive.Root open={menuAbierto} onOpenChange={setMenuAbierto}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex h-svh w-64 flex-col overflow-y-auto bg-surface-low shadow-xl outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navegacion</DialogPrimitive.Title>
            <ContenidoSidebar
              navegacion={navegacion}
              usuario={usuario}
              onLogout={() => {
                setMenuAbierto(false)
                logout()
              }}
              onNavegar={() => setMenuAbierto(false)}
              onCambiarPassword={() => {
                setMenuAbierto(false)
                setCambiarPassAbierto(true)
              }}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CambiarPasswordDialog
        abierto={cambiarPassAbierto}
        onCerrar={() => setCambiarPassAbierto(false)}
      />
    </div>
  )
}
