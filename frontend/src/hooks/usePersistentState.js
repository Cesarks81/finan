import { useCallback, useState } from 'react'

/** Como `useState`, pero recuerda el valor en este navegador (localStorage, como JSON). */
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? initialValue : JSON.parse(stored)
    } catch {
      return initialValue
    }
  })

  const setPersistent = useCallback(
    (next) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Sin almacenamiento (modo privado): el valor dura lo que la pestaña.
      }
    },
    [key],
  )

  return [value, setPersistent]
}
