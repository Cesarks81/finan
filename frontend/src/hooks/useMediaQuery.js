import { useCallback, useSyncExternalStore } from 'react'

/** `true` mientras la media query se cumple; se actualiza al redimensionar. */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Breakpoint `md` de Tailwind: a partir de aquí se usa el diseño de PC. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
