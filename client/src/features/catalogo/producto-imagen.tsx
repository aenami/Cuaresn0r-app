import { useEffect, useState } from 'react'
import { resolverUrlImagen } from '@/lib/api'
import { cn } from '@/lib/utils'

// Imagen de producto con fallback tipografico: si no hay imagen o falla la
// carga, se muestra la inicial sobre la superficie mas profunda.
export function ProductoImagen({
  src,
  nombre,
  className,
}: {
  src: string | null
  nombre: string
  className?: string
}) {
  const [fallo, setFallo] = useState(false)
  const url = resolverUrlImagen(src)
  // Reintenta la carga si cambia la imagen (p. ej. al subir una nueva en el form).
  useEffect(() => setFallo(false), [url])
  const mostrarFallback = !url || fallo

  if (mostrarFallback) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center bg-surface-lowest font-heading text-3xl font-semibold text-muted-foreground/40',
          className,
        )}
      >
        {nombre.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={nombre}
      loading="lazy"
      onError={() => setFallo(true)}
      className={cn('object-cover', className)}
    />
  )
}
