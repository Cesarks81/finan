/**
 * Copia de seguridad en archivo: la que da `GET /api/backup` (ajustes y todos los flujos),
 * guardada como JSON legible. Importarla (`PUT /api/backup`) sustituye todos los datos.
 */

/** Archivo de la copia: «finan-copia-2026-10-16.json». */
export function backupFile(backup) {
  const name = `finan-copia-${backup.exported_on}.json`
  return new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' })
}

/**
 * Guarda el archivo. En móvil abre la hoja de compartir del sistema (en el iPhone, «Guardar en
 * Archivos», AirDrop, Mail…), si admite archivos; si no, o en PC, lo descarga. Hay que llamarla
 * sin esperas desde el toque (el navegador solo deja compartir justo después de él). Devuelve
 * false si se cancela la hoja de compartir.
 */
export async function saveFile(file) {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (err) {
      if (err.name === 'AbortError') return false
      // Si no deja compartir, se descarga.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/** Lee un archivo elegido por el usuario: la copia, o un error si no es una copia de finan. */
export async function readBackup(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = null
  }
  if (data?.app !== 'finan' || !Array.isArray(data.flows) || typeof data.settings !== 'object' || !data.settings) {
    throw new Error('Este archivo no es una copia de seguridad de finan.')
  }
  return data
}
