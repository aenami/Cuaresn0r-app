import type { KeyboardEvent } from 'react'

// Navegación espacial, solo desde controles de acción. Los campos y widgets
// compuestos conservan sus flechas nativas (importe, select, radios, menús).
export function navegarConFlechas(evento: KeyboardEvent<HTMLElement>) {
  if (
    !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.key) ||
    evento.altKey ||
    evento.ctrlKey ||
    evento.metaKey
  )
    return
  const actual = evento.target as HTMLElement
  if (
    !actual.matches('button, a[href]') ||
    actual.closest(
      '[role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"]',
    )
  )
    return
  const origen = actual.getBoundingClientRect()
  const x = origen.left + origen.width / 2,
    y = origen.top + origen.height / 2
  const horizontal = evento.key === 'ArrowLeft' || evento.key === 'ArrowRight'
  const signo =
    evento.key === 'ArrowRight' || evento.key === 'ArrowDown' ? 1 : -1
  const candidatos = [
    ...evento.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href]',
    ),
  ].filter(
    (el) =>
      el !== actual &&
      !el.closest('[hidden], [aria-hidden="true"], [inert]') &&
      el.getClientRects().length,
  )
  let mejor: HTMLElement | undefined,
    distancia = Infinity
  for (const el of candidatos) {
    const r = el.getBoundingClientRect(),
      dx = r.left + r.width / 2 - x,
      dy = r.top + r.height / 2 - y
    const avance = (horizontal ? dx : dy) * signo
    if (avance <= 1) continue
    const lateral = Math.abs(horizontal ? dy : dx)
    const peso = avance + lateral * 3
    if (peso < distancia) {
      mejor = el
      distancia = peso
    }
  }
  if (mejor) {
    evento.preventDefault()
    mejor.focus()
    mejor.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}
