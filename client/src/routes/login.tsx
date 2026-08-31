import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, Eye, EyeOff, Flame, IdCard, Lock } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore, tokenVigente } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const esquemaLogin = z.object({
  email: z.email('Ingresa un email valido'),
  password: z.string().min(1, 'Ingresa la contraseña'),
})

type ValoresLogin = z.infer<typeof esquemaLogin>

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: () => {
    if (tokenVigente(useAuthStore.getState().token)) {
      throw redirect({ to: '/' })
    }
  },
  component: PaginaLogin,
})

function PaginaLogin() {
  const router = useRouter()
  const { redirect: destino } = Route.useSearch()
  const iniciarSesion = useAuthStore((s) => s.iniciarSesion)
  const [verClave, setVerClave] = useState(false)

  const form = useForm<ValoresLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: '', password: '' },
  })

  const login = useMutation({
    mutationFn: (valores: ValoresLogin) => api.post<{ token: string }>('/auth/login', valores),
    onSuccess: ({ token }) => {
      iniciarSesion(token)
      router.history.push(destino ?? '/')
    },
  })

  const mensajeError =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'No se pudo contactar el servidor'
        : null

  return (
    <main className="relative flex min-h-svh bg-background text-foreground">
      {/* Hero: foto de linea de cocina. Solo en pantallas anchas (tablet horizontal / desktop) */}
      <section className="relative hidden flex-1 overflow-hidden lg:block">
        <img
          src="/login-hero.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ filter: 'grayscale(0.18) brightness(0.85) contrast(1.06)' }}
        />
        {/* Velo inferior: funde la foto en el fondo para que el texto respire */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--background) 3%, rgb(14 14 14 / 55%) 42%, transparent 78%)',
          }}
        />
        {/* Resplandor de calor, no sombra (firma del sistema) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(42rem 30rem at 12% 6%, rgb(255 145 87 / 15%), transparent 60%)',
          }}
        />

        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="micro-label text-primary">Estacion 01 · Alta velocidad</span>
          </div>
          <h2 className="mt-5 font-heading text-6xl font-bold uppercase leading-[0.9] tracking-tighter xl:text-7xl">
            Precision
            <br />
            <span className="text-primary italic">en movimiento.</span>
          </h2>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
            CorePOS, comando de cocina para el servicio de alta velocidad. Inicia sesion para
            comenzar el turno.
          </p>
        </div>
      </section>

      {/* Panel de acceso */}
      <section className="relative flex w-full shrink-0 flex-col justify-center px-6 py-12 sm:px-10 lg:w-[30rem] lg:border-l-4 lg:border-primary/80 xl:w-[34rem]">
        {/* Resplandor ambiental para el modo sin foto (movil / tablet vertical) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              'radial-gradient(36rem 20rem at 50% -6%, rgb(255 145 87 / 9%), transparent 70%)',
          }}
        />

        <div className="relative mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <Flame className="size-6 text-primary" strokeWidth={2.5} />
            <h1 className="font-heading text-3xl font-semibold tracking-tighter text-primary">
              CorePOS
            </h1>
          </div>
          <p className="micro-label mt-2">Comando de cocina · Interfaz de servicio</p>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((valores) => login.mutate(valores))}
              className="mt-9 space-y-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="micro-label">Correo del personal</FormLabel>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="nombre@pos.local"
                          autoFocus
                          className="h-11 pl-10"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="micro-label">Clave de acceso</FormLabel>
                      <button
                        type="button"
                        onClick={() =>
                          toast.info('Pidele a un administrador que restablezca tu clave.')
                        }
                        className="micro-label text-primary transition-opacity hover:opacity-80"
                      >
                        ¿Olvidaste tu clave?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type={verClave ? 'text' : 'password'}
                          autoComplete="current-password"
                          className="h-11 px-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setVerClave((v) => !v)}
                        aria-label={verClave ? 'Ocultar clave' : 'Mostrar clave'}
                        className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {verClave ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mensajeError ? (
                <div
                  role="alert"
                  className="border-l-4 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {mensajeError}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="btn-heat h-11 w-full font-heading text-sm font-semibold uppercase tracking-wide"
                disabled={login.isPending}
              >
                {login.isPending ? (
                  'Verificando…'
                ) : (
                  <>
                    Iniciar sesion
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-10 flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="micro-label">Sistema en linea</span>
            </div>
            <span className="micro-label">v0.1 · entorno local</span>
          </div>
        </div>
      </section>
    </main>
  )
}
