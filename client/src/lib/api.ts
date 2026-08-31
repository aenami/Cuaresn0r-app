import { useAuthStore } from '@/stores/auth.store'

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Origen del backend, para resolver rutas relativas de assets (p. ej. las
// imagenes servidas en /uploads).
export const API_BASE_URL = BASE_URL

// Resuelve el valor guardado de una imagen a una URL cargable:
// - rutas relativas del backend (`/uploads/...`) se anteponen al origen del API;
// - URLs absolutas (http, data, blob) se dejan tal cual (compat con datos previos
//   y con previews locales).
export function resolverUrlImagen(src: string | null | undefined): string | null {
  if (!src) return null
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  return `${API_BASE_URL}${src.startsWith('/') ? '' : '/'}${src}`
}

// Forma de los errores que devuelve NestJS: { statusCode, message, error }.
// message puede ser un string o un arreglo (errores de class-validator).
export class ApiError extends Error {
  readonly status: number
  readonly detalles: string[]

  constructor(status: number, message: string, detalles: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detalles = detalles
  }
}

async function procesarRespuesta<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    // Token vencido o revocado (el backend valida contra DB en cada request):
    // se cierra la sesion local salvo que el 401 venga del propio login.
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      useAuthStore.getState().logout()
    }

    const body = (await res.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const mensajes = Array.isArray(body?.message)
      ? body.message
      : body?.message
        ? [body.message]
        : [res.statusText]
    throw new ApiError(res.status, mensajes.join('. '), mensajes)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  return procesarRespuesta<T>(res, path)
}

// Envio multipart (FormData): NO se fija Content-Type a mano, el navegador pone
// el boundary correcto. Reutiliza el manejo de auth/errores de `request`.
async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().token

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  return procesarRespuesta<T>(res, path)
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
}
